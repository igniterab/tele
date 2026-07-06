import { z } from "zod";

/**
 * Normalized inbound-email shape our webhook accepts. In production this is
 * what provider-specific adapters (Postmark/SendGrid/Mailgun inbound parse
 * webhooks) translate *into* — see packages/api/src/modules/email/parse.ts.
 */
export const inboundEmailWebhookSchema = z.object({
  workspaceSlug: z.string().min(1).max(80),
  from: z.object({
    email: z.string().trim().toLowerCase().email(),
    name: z.string().trim().max(200).optional(),
  }),
  to: z.array(z.string().trim().toLowerCase().email()).min(1),
  subject: z.string().max(500).default("(no subject)"),
  text: z.string().max(500_000).default(""),
  html: z.string().max(500_000).optional(),
  messageId: z.string().min(1).max(998),
  inReplyTo: z.string().max(998).optional(),
  references: z.string().max(5000).optional(),
});
export type InboundEmailWebhookInput = z.infer<typeof inboundEmailWebhookSchema>;
