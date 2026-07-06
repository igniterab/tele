import type { FastifyInstance } from "fastify";
import { getAnalytics } from "./service.js";

export default async function analyticsRoutes(fastify: FastifyInstance) {
  const preHandler = [fastify.authenticate, fastify.requireWorkspaceMember()];

  fastify.get("/api/workspaces/:workspaceId/analytics", { preHandler }, async (req, reply) => {
    const analytics = await getAnalytics(req.workspace!.id);
    reply.send({ analytics });
  });
}
