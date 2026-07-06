import type { FastifyInstance } from "fastify";
import { inboundEmailWebhookSchema } from "@tele/shared";
import { normalizeGenericPayload } from "./parse.js";
import { enqueueInboundEmail } from "../../queues/index.js";

export default async function emailRoutes(fastify: FastifyInstance) {
  // Normalized inbound-email webhook. In production this is where a provider
  // adapter (see parse.ts) would sit in front — Postmark/SendGrid/Mailgun all
  // support pointing their inbound-parse webhook at a URL like this one, just
  // with their own payload shape translated to ours first.
  fastify.post(
    "/webhooks/email/inbound",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const input = inboundEmailWebhookSchema.parse(req.body);
      const job = normalizeGenericPayload(input);
      await enqueueInboundEmail(job);
      // Ack immediately — actual processing (thread matching, persistence,
      // broadcast) happens off the request path via the queue, so a slow DB
      // or a burst of mail can't make the webhook time out and get retried
      // by the sending provider into a duplicate-delivery storm.
      reply.code(202).send({ accepted: true });
    },
  );
}
