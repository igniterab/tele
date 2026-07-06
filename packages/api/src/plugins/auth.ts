import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db/client.js";
import { verifySessionToken, verifyVisitorToken } from "../lib/jwt.js";

export const SESSION_COOKIE = "session";

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) {
      reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Login required" } });
      return;
    }
    try {
      const payload = verifySessionToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new Error("user not found");
      req.authUser = user;
    } catch {
      reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Invalid or expired session" } });
    }
  });

  fastify.decorate("authenticateVisitor", async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) {
      reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Visitor session required" } });
      return;
    }
    try {
      const payload = verifyVisitorToken(token);
      req.visitor = { contactId: payload.sub, workspaceId: payload.workspaceId };
    } catch {
      reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Invalid or expired visitor session" } });
    }
  });
}

export default fp(authPlugin, { name: "auth-plugin" });

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateVisitor: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
