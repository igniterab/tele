/**
 * Simulates a customer emailing support in, for local demo/testing purposes —
 * stands in for a real provider's inbound-parse webhook (Postmark/SendGrid/
 * Mailgun), which we don't have credentials for in this environment. Posts the
 * same normalized shape the real webhook expects at
 * `POST /webhooks/email/inbound`.
 *
 * Usage:
 *   npx tsx scripts/simulate-inbound-email.ts <workspaceSlug> "<subject>" "<body text>" [inReplyTo]
 *
 * Example (first message in a new thread):
 *   npx tsx scripts/simulate-inbound-email.ts acme-support "Refund question" "Hi, I'd like a refund for order #123."
 *
 * Example (reply into an existing thread, using the Message-ID Tele sent):
 *   npx tsx scripts/simulate-inbound-email.ts acme-support "Re: Refund question" "Any update?" "<abc123@acme-support.tele.local>"
 */
import { randomUUID } from "node:crypto";

const [, , workspaceSlug, subject, body, inReplyTo] = process.argv;

if (!workspaceSlug || !subject || !body) {
  console.error("Usage: simulate-inbound-email.ts <workspaceSlug> <subject> <body> [inReplyTo]");
  process.exit(1);
}

const apiBase = process.env.API_BASE ?? "http://localhost:4000";

const payload = {
  workspaceSlug,
  from: { email: "customer@example.com", name: "Curious Customer" },
  to: [`support@${workspaceSlug}.tele.local`],
  subject,
  text: body,
  messageId: `<${randomUUID()}@customer-mail.example.com>`,
  ...(inReplyTo ? { inReplyTo, references: inReplyTo } : {}),
};

const res = await fetch(`${apiBase}/webhooks/email/inbound`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

console.log(res.status, await res.json());
