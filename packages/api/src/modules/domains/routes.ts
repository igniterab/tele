import type { FastifyInstance } from "fastify";
import { addDomainSchema } from "@tele/shared";
import * as domains from "./service.js";
import { enqueueDomainCheck } from "../../queues/index.js";

export default async function domainRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/workspaces/:workspaceId/domains",
    { preHandler: [fastify.authenticate, fastify.requireWorkspaceMember()] },
    async (req, reply) => {
      reply.send({ domains: await domains.listDomains(req.workspace!.id) });
    },
  );

  fastify.post(
    "/api/workspaces/:workspaceId/domains",
    { preHandler: [fastify.authenticate, fastify.requireWorkspaceMember("ADMIN")] },
    async (req, reply) => {
      const input = addDomainSchema.parse(req.body);
      const domain = await domains.addDomain(req.workspace!.id, input.hostname);
      reply.code(201).send({ domain });
    },
  );

  fastify.post(
    "/api/workspaces/:workspaceId/domains/:id/recheck",
    { preHandler: [fastify.authenticate, fastify.requireWorkspaceMember("ADMIN")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await enqueueDomainCheck(id);
      reply.send({ ok: true });
    },
  );

  fastify.delete(
    "/api/workspaces/:workspaceId/domains/:id",
    { preHandler: [fastify.authenticate, fastify.requireWorkspaceMember("ADMIN")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await domains.deleteDomain(req.workspace!.id, id);
      reply.send({ ok: true });
    },
  );
}
