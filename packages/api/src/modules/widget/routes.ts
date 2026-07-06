import type { FastifyInstance } from "fastify";
import { listMessagesQuerySchema, sendMessageSchema, widgetSessionSchema } from "@tele/shared";
import { bootstrapWidgetSession } from "./service.js";
import { getOrCreateChatConversation, getConversation } from "../conversations/service.js";
import { createMessage, listMessages, markConversationRead } from "../messages/service.js";
import { toMessageDTO } from "../messages/mappers.js";
import { ApiError } from "../../plugins/error-handler.js";
import { prisma } from "../../db/client.js";

async function requireOwnConversation(workspaceId: string, contactId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId, contactId },
  });
  if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
  return conversation;
}

export default async function widgetRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/api/public/widget/session",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const input = widgetSessionSchema.parse(req.body);
      const { workspace, contact, visitorToken } = await bootstrapWidgetSession(input.workspaceSlug, input.visitorToken);
      reply.send({
        visitorToken,
        contact: { id: contact.id, name: contact.name, email: contact.email },
        workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      });
    },
  );

  fastify.get(
    "/api/public/widget/conversation",
    { preHandler: fastify.authenticateVisitor },
    async (req, reply) => {
      const conversation = await getOrCreateChatConversation(req.visitor!.workspaceId, req.visitor!.contactId);
      const dto = await getConversation(req.visitor!.workspaceId, conversation.id);
      reply.send({ conversation: dto });
    },
  );

  fastify.get(
    "/api/public/widget/conversations/:id/messages",
    { preHandler: fastify.authenticateVisitor },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await requireOwnConversation(req.visitor!.workspaceId, req.visitor!.contactId, id);
      const query = listMessagesQuerySchema.parse(req.query);
      const messages = await listMessages(req.visitor!.workspaceId, id, query.after, query.limit);
      reply.send({ messages: messages ?? [] });
    },
  );

  fastify.post(
    "/api/public/widget/conversations/:id/messages",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } }, preHandler: fastify.authenticateVisitor },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await requireOwnConversation(req.visitor!.workspaceId, req.visitor!.contactId, id);
      const input = sendMessageSchema.parse(req.body);
      const message = await createMessage({
        workspaceId: req.visitor!.workspaceId,
        conversationId: id,
        senderType: "CONTACT",
        bodyHtml: input.bodyHtml,
        channel: "CHAT",
      });
      reply.code(201).send({ message: toMessageDTO(message) });
    },
  );

  fastify.post(
    "/api/public/widget/conversations/:id/read",
    { preHandler: fastify.authenticateVisitor },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await requireOwnConversation(req.visitor!.workspaceId, req.visitor!.contactId, id);
      await markConversationRead(req.visitor!.workspaceId, id, "CONTACT");
      reply.send({ ok: true });
    },
  );
}
