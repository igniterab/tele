import type { FastifyInstance } from "fastify";
import {
  assignConversationSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  sendMessageSchema,
  snoozeConversationSchema,
  updateConversationStatusSchema,
} from "@tele/shared";
import * as conversationsService from "./service.js";
import { summarizeConversation } from "../ai/summarize.js";
import { createMessage, listMessages, markConversationRead } from "../messages/service.js";
import { toMessageDTO } from "../messages/mappers.js";
import { ApiError } from "../../plugins/error-handler.js";

export default async function conversationsRoutes(fastify: FastifyInstance) {
  const preHandler = [fastify.authenticate, fastify.requireWorkspaceMember()];

  fastify.get("/api/workspaces/:workspaceId/conversations", { preHandler }, async (req, reply) => {
    const query = listConversationsQuerySchema.parse(req.query);
    const conversations = await conversationsService.listConversations(req.workspace!.id, query);
    reply.send({ conversations });
  });

  fastify.get("/api/workspaces/:workspaceId/conversations/:id", { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const conversation = await conversationsService.getConversation(req.workspace!.id, id);
    reply.send({ conversation });
  });

  fastify.get("/api/workspaces/:workspaceId/conversations/:id/messages", { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = listMessagesQuerySchema.parse(req.query);
    const messages = await listMessages(req.workspace!.id, id, query.after, query.limit);
    if (messages === null) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
    reply.send({ messages });
  });

  fastify.post("/api/workspaces/:workspaceId/conversations/:id/messages", { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = sendMessageSchema.parse(req.body);
    const conversation = await conversationsService.getConversation(req.workspace!.id, id);

    const message = await createMessage({
      workspaceId: req.workspace!.id,
      conversationId: id,
      senderType: "AGENT",
      senderId: req.authUser!.id,
      bodyHtml: input.bodyHtml,
      channel: conversation.channel,
    });
    reply.code(201).send({ message: toMessageDTO(message) });
  });

  fastify.post("/api/workspaces/:workspaceId/conversations/:id/read", { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await markConversationRead(req.workspace!.id, id, "AGENT");
    reply.send({ ok: true });
  });

  // Manual "Refresh AI summary": force-regenerate now, bypassing the freshness
  // guard. Runs inline (not via the debounced queue) so the agent gets an
  // immediate result; the fresh summary is also broadcast over the socket.
  fastify.post("/api/workspaces/:workspaceId/conversations/:id/summarize", { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await conversationsService.getConversation(req.workspace!.id, id); // 404s if not in this workspace
    await summarizeConversation(id, { force: true });
    const conversation = await conversationsService.getConversation(req.workspace!.id, id);
    reply.send({ conversation });
  });

  fastify.patch("/api/workspaces/:workspaceId/conversations/:id/assign", { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = assignConversationSchema.parse(req.body);
    const conversation = await conversationsService.assignConversation(req.workspace!.id, id, input.assigneeId);
    reply.send({ conversation });
  });

  fastify.patch("/api/workspaces/:workspaceId/conversations/:id/status", { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = updateConversationStatusSchema.parse(req.body);
    const conversation = await conversationsService.updateConversationStatus(req.workspace!.id, id, input.status);
    reply.send({ conversation });
  });

  fastify.patch("/api/workspaces/:workspaceId/conversations/:id/snooze", { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = snoozeConversationSchema.parse(req.body);
    const conversation = await conversationsService.snoozeConversation(req.workspace!.id, id, input.snoozedUntil);
    reply.send({ conversation });
  });
}
