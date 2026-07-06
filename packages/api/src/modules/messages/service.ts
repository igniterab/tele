import { prisma } from "../../db/client.js";
import { sanitizeMessageHtml, htmlToText } from "../../lib/sanitize.js";
import { getEmitter } from "../../realtime/emitter.js";
import { conversationRoom, workspaceRoom } from "../../realtime/rooms.js";
import { enqueueOutboundEmail, enqueueSummarize } from "../../queues/index.js";
import { toMessageDTO } from "./mappers.js";
import { toConversationDTO } from "../conversations/mappers.js";
import { logger } from "../../logger.js";
import type { Channel, SenderType } from "@tele/shared";

export interface CreateMessageInput {
  workspaceId: string;
  conversationId: string;
  senderType: SenderType;
  senderId?: string | null;
  bodyHtml: string;
  channel: Channel;
  emailMessageId?: string;
  emailInReplyTo?: string;
  emailReferences?: string;
}

export async function createMessage(input: CreateMessageInput) {
  const cleanHtml = sanitizeMessageHtml(input.bodyHtml);
  const bodyText = htmlToText(cleanHtml);

  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
      senderType: input.senderType,
      senderId: input.senderId ?? null,
      bodyHtml: cleanHtml,
      bodyText,
      channel: input.channel,
      emailMessageId: input.emailMessageId,
      emailInReplyTo: input.emailInReplyTo,
      emailReferences: input.emailReferences,
    },
    include: { sender: true },
  });

  const conversation = await prisma.conversation.update({
    where: { id: input.conversationId },
    data: {
      lastMessageAt: message.createdAt,
      ...(input.senderType === "CONTACT" ? { status: "OPEN" as const } : {}),
    },
    include: { contact: true, assignee: true },
  });

  // Carry the real unread count on the conversation:updated broadcast, otherwise
  // the inbox list would overwrite its badge with 0 on every new message.
  const unreadCount = await countUnreadForAgent(conversation.id);
  try {
    const io = getEmitter();
    io.of("/agent").to(conversationRoom(conversation.id)).emit("message:new", toMessageDTO(message));
    io.of("/widget").to(conversationRoom(conversation.id)).emit("message:new", toMessageDTO(message));
    io.of("/agent")
      .to(workspaceRoom(input.workspaceId))
      .emit("conversation:updated", toConversationDTO({ ...conversation, _unreadCount: unreadCount }));
  } catch (err) {
    logger.warn({ err }, "realtime broadcast failed for new message");
  }

  await enqueueSummarize(input.conversationId).catch((err) =>
    logger.warn({ err, conversationId: input.conversationId }, "failed to enqueue summarize job"),
  );

  if (input.channel === "EMAIL" && input.senderType === "AGENT") {
    await enqueueOutboundEmail(message.id).catch((err) =>
      logger.warn({ err, messageId: message.id }, "failed to enqueue outbound email job"),
    );
  }

  return message;
}

export async function listMessages(workspaceId: string, conversationId: string, after?: string, limit = 50) {
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
  if (!conversation) return null;

  const cursorMessage = after ? await prisma.message.findUnique({ where: { id: after } }) : null;

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      // Composite (createdAt, id) cursor: strictly-after the cursor message in
      // the same total order we sort by, so a message sharing the exact same
      // millisecond `createdAt` as the cursor is not skipped on catch-up.
      ...(cursorMessage
        ? {
            OR: [
              { createdAt: { gt: cursorMessage.createdAt } },
              { createdAt: cursorMessage.createdAt, id: { gt: cursorMessage.id } },
            ],
          }
        : {}),
    },
    include: { sender: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  return messages.map(toMessageDTO);
}

/** Unread = the visitor's (CONTACT) messages an agent hasn't read yet. */
export async function countUnreadForAgent(conversationId: string): Promise<number> {
  return prisma.message.count({ where: { conversationId, senderType: "CONTACT", readAt: null } });
}

export async function markConversationRead(workspaceId: string, conversationId: string, readBy: SenderType) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    include: { contact: true, assignee: true },
  });
  if (!conversation) return;

  const otherType: SenderType = readBy === "AGENT" ? "CONTACT" : "AGENT";
  const readAt = new Date();
  const { count } = await prisma.message.updateMany({
    where: { conversationId, senderType: otherType, readAt: null },
    data: { readAt },
  });
  if (count === 0) return;

  const io = getEmitter();
  const payload = { conversationId, readAt: readAt.toISOString(), readBy };
  io.of("/agent").to(conversationRoom(conversationId)).emit("message:read", payload);
  io.of("/widget").to(conversationRoom(conversationId)).emit("message:read", payload);

  // When an agent reads, the inbox unread badge should clear live for everyone.
  if (readBy === "AGENT") {
    const unreadCount = await countUnreadForAgent(conversationId);
    io.of("/agent")
      .to(workspaceRoom(workspaceId))
      .emit("conversation:updated", toConversationDTO({ ...conversation, _unreadCount: unreadCount }));
  }
}
