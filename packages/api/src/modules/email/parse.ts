import type { InboundEmailWebhookInput } from "@tele/shared";
import type { EmailInboundJob } from "../../queues/index.js";

/**
 * Our own webhook already receives the normalized shape (see
 * `inboundEmailWebhookSchema`), so this is close to a passthrough — the
 * interesting part is the *pattern*: every real provider gets its own
 * `parseXInbound` below that ends at this same normalized shape, so
 * `modules/email/service.ts` and the BullMQ job never need to know which
 * provider is in front of them.
 */
export function normalizeGenericPayload(input: InboundEmailWebhookInput): EmailInboundJob {
  return {
    workspaceSlugOrId: input.workspaceSlug,
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html ?? textToBasicHtml(input.text),
    messageId: normalizeMessageId(input.messageId),
    inReplyTo: input.inReplyTo ? normalizeMessageId(input.inReplyTo) : undefined,
    references: input.references,
  };
}

function normalizeMessageId(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith("<") ? trimmed : `<${trimmed}>`;
}

function textToBasicHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * STUB — not exercised against a real Postmark account (no credentials in
 * this environment). Shape follows Postmark's "Inbound Message" webhook
 * payload (https://postmarkapp.com/developer/webhooks/inbound-webhook):
 * FromFull.{Email,Name}, ToFull[].Email, Subject, TextBody, HtmlBody,
 * MessageID, Headers[] containing In-Reply-To/References.
 * Wire this up by pointing Postmark's inbound webhook at
 * `POST /webhooks/email/inbound/postmark` and mapping the fields below —
 * the workspace is resolved from the recipient address's subdomain
 * (e.g. support@acme-support.tele.local -> workspaceSlug "acme-support").
 */
export function parsePostmarkInbound(payload: Record<string, unknown>): EmailInboundJob {
  const headers = (payload.Headers as Array<{ Name: string; Value: string }>) ?? [];
  const header = (name: string) => headers.find((h) => h.Name.toLowerCase() === name.toLowerCase())?.Value;
  const toFull = (payload.ToFull as Array<{ Email: string }>) ?? [];
  const fromFull = payload.FromFull as { Email: string; Name?: string };

  return {
    workspaceSlugOrId: workspaceSlugFromRecipient(toFull[0]?.Email ?? ""),
    from: { email: fromFull.Email, name: fromFull.Name },
    to: toFull.map((t) => t.Email),
    subject: (payload.Subject as string) ?? "(no subject)",
    text: (payload.TextBody as string) ?? "",
    html: (payload.HtmlBody as string) ?? undefined,
    messageId: normalizeMessageId((payload.MessageID as string) ?? ""),
    inReplyTo: header("In-Reply-To") ? normalizeMessageId(header("In-Reply-To")!) : undefined,
    references: header("References"),
  };
}

function workspaceSlugFromRecipient(email: string): string {
  // support@<slug>.tele.local -> <slug>
  const domainPart = email.split("@")[1] ?? "";
  return domainPart.split(".")[0] ?? "";
}
