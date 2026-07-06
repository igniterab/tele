import { prisma } from "../../db/client.js";
import { logger } from "../../logger.js";
import { env } from "../../env.js";
import { sendMail } from "../../lib/mailer.js";
import { extractMessageIds, generateMessageId, buildReferences } from "../../lib/threading.js";
import { createMessage } from "../messages/service.js";
import type { EmailInboundJob, EmailOutboundJob } from "../../queues/index.js";

const THREAD_FALLBACK_WINDOW_DAYS = 30;

async function findOrCreateContact(workspaceId: string, email: string, name?: string) {
  const existing = await prisma.contact.findFirst({ where: { workspaceId, email } });
  if (existing) {
    if (name && !existing.name) {
      await prisma.contact.update({ where: { id: existing.id }, data: { name } });
    }
    return existing;
  }
  return prisma.contact.create({ data: { workspaceId, email, name } });
}

function normalizeSubject(subject: string): string {
  return subject.replace(/^\s*(re|fwd?)\s*:\s*/i, "").trim().toLowerCase();
}

async function findThreadConversation(
  workspaceId: string,
  contactId: string,
  inReplyTo: string | undefined,
  references: string | undefined,
  subject: string,
) {
  const candidateIds = new Set<string>([...extractMessageIds(inReplyTo), ...extractMessageIds(references)]);
  if (candidateIds.size > 0) {
    const match = await prisma.message.findFirst({
      where: { workspaceId, emailMessageId: { in: [...candidateIds] } },
      include: { conversation: true },
    });
    if (match) return match.conversation;
  }

  // Best-effort fallback when threading headers are missing/stripped: same
  // contact, same normalized subject, recent activity.
  const normalized = normalizeSubject(subject);
  if (normalized) {
    const fallback = await prisma.conversation.findFirst({
      where: {
        workspaceId,
        contactId,
        channel: "EMAIL",
        lastMessageAt: { gte: new Date(Date.now() - THREAD_FALLBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000) },
      },
      orderBy: { lastMessageAt: "desc" },
    });
    if (fallback && fallback.subject && normalizeSubject(fallback.subject) === normalized) {
      return fallback;
    }
  }

  return null;
}

export async function processInboundEmail(job: EmailInboundJob): Promise<void> {
  const workspace = await prisma.workspace.findFirst({
    where: { OR: [{ slug: job.workspaceSlugOrId }, { id: job.workspaceSlugOrId }] },
  });
  if (!workspace) {
    logger.warn({ workspaceSlugOrId: job.workspaceSlugOrId }, "inbound email for unknown workspace, dropping");
    return;
  }

  const contact = await findOrCreateContact(workspace.id, job.from.email, job.from.name);

  let conversation = await findThreadConversation(workspace.id, contact.id, job.inReplyTo, job.references, job.subject);
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { workspaceId: workspace.id, contactId: contact.id, channel: "EMAIL", subject: job.subject, status: "OPEN" },
    });
  }

  await createMessage({
    workspaceId: workspace.id,
    conversationId: conversation.id,
    senderType: "CONTACT",
    bodyHtml: job.html,
    channel: "EMAIL",
    emailMessageId: job.messageId,
    emailInReplyTo: job.inReplyTo,
    emailReferences: job.references,
  });
}

export async function processOutboundEmail(job: EmailOutboundJob): Promise<void> {
  const message = await prisma.message.findUnique({
    where: { id: job.messageId },
    include: { conversation: { include: { contact: true, workspace: true } } },
  });
  if (!message) {
    logger.warn({ messageId: job.messageId }, "outbound email job for missing message, dropping");
    return;
  }
  const { conversation } = message;
  const { contact, workspace } = conversation;
  if (!contact.email) {
    logger.warn({ messageId: job.messageId, contactId: contact.id }, "outbound email: contact has no email address");
    return;
  }

  const lastInbound = await prisma.message.findFirst({
    where: { conversationId: conversation.id, senderType: "CONTACT", emailMessageId: { not: null } },
    orderBy: { createdAt: "desc" },
  });

  const ourMessageId = generateMessageId(workspace.slug);
  const references = buildReferences(lastInbound?.emailReferences ?? null, lastInbound?.emailMessageId ?? null);

  const result = await sendMail({
    from: `${workspace.name} <support@${workspace.slug}.${env.EMAIL_DOMAIN}>`,
    to: contact.email,
    subject: conversation.subject ? `Re: ${conversation.subject}` : "Re: your message",
    html: message.bodyHtml,
    text: message.bodyText,
    messageId: ourMessageId,
    inReplyTo: lastInbound?.emailMessageId ?? undefined,
    references: references ?? undefined,
  });

  await prisma.message.update({
    where: { id: message.id },
    data: {
      emailMessageId: ourMessageId,
      emailInReplyTo: lastInbound?.emailMessageId ?? undefined,
      emailReferences: references ?? undefined,
      emailDeliveryStatus: result.ok ? "SENT" : "FAILED",
    },
  });

  if (!result.ok) {
    // BullMQ will retry the job per its configured attempts/backoff; this only
    // logs the current attempt's outcome so it's visible without needing to
    // inspect the queue directly.
    logger.warn({ messageId: message.id, error: result.error }, "outbound email send failed, will retry");
    throw new Error(`Outbound email send failed: ${result.error}`);
  }
}
