import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@tele/shared";
import { prisma } from "../db/client.js";

async function workspacePlugin(fastify: FastifyInstance) {
  fastify.decorate("requireWorkspaceMember", (requiredRole?: Role) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      const { workspaceId } = req.params as { workspaceId?: string };
      if (!req.authUser || !workspaceId) {
        reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Login required" } });
        return;
      }
      const membership = await prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: req.authUser.id } },
      });
      if (!membership || membership.status !== "ACTIVE") {
        reply.code(403).send({ error: { code: "FORBIDDEN", message: "Not a member of this workspace" } });
        return;
      }
      if (requiredRole && membership.role !== requiredRole) {
        reply.code(403).send({ error: { code: "FORBIDDEN", message: `Requires ${requiredRole} role` } });
        return;
      }
      const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (!workspace) {
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Workspace not found" } });
        return;
      }
      req.membership = membership;
      req.workspace = workspace;
    };
  });
}

export default fp(workspacePlugin, { name: "workspace-plugin" });

declare module "fastify" {
  interface FastifyInstance {
    requireWorkspaceMember: (requiredRole?: Role) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
