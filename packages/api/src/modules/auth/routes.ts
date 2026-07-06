import type { FastifyInstance } from "fastify";
import { signupSchema, loginSchema, acceptInviteSchema } from "@tele/shared";
import { authenticateUser, createWorkspaceAndAdmin, listUserWorkspaces } from "./service.js";
import { establishSession, clearSession } from "../../lib/session.js";
import { prisma } from "../../db/client.js";
import { hashPassword } from "../../lib/password.js";
import { ApiError } from "../../plugins/error-handler.js";

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/api/auth/signup", {
    config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
    handler: async (req, reply) => {
      const input = signupSchema.parse(req.body);
      const { user, workspace } = await createWorkspaceAndAdmin(input);
      establishSession(reply, user.id);
      reply.code(201).send({
        user: { id: user.id, name: user.name, email: user.email },
        workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      });
    },
  });

  fastify.post("/api/auth/login", {
    config: { rateLimit: { max: 20, timeWindow: "10 minutes" } },
    handler: async (req, reply) => {
      const input = loginSchema.parse(req.body);
      const user = await authenticateUser(input.email, input.password);
      establishSession(reply, user.id);
      const workspaces = await listUserWorkspaces(user.id);
      reply.send({ user: { id: user.id, name: user.name, email: user.email }, workspaces });
    },
  });

  fastify.post("/api/auth/logout", async (_req, reply) => {
    clearSession(reply);
    reply.send({ ok: true });
  });

  fastify.get("/api/auth/me", { preHandler: fastify.authenticate }, async (req, reply) => {
    const workspaces = await listUserWorkspaces(req.authUser!.id);
    reply.send({
      user: { id: req.authUser!.id, name: req.authUser!.name, email: req.authUser!.email },
      workspaces,
    });
  });

  fastify.get("/api/invites/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const invite = await prisma.invite.findUnique({ where: { token }, include: { workspace: true } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new ApiError(404, "INVITE_NOT_FOUND", "This invite is invalid or has expired");
    }
    reply.send({
      email: invite.email,
      role: invite.role,
      workspaceName: invite.workspace.name,
    });
  });

  fastify.post("/api/invites/:token/accept", {
    config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
    handler: async (req, reply) => {
      const { token } = req.params as { token: string };
      const input = acceptInviteSchema.parse({ ...(req.body as object), token });

      const invite = await prisma.invite.findUnique({ where: { token } });
      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
        throw new ApiError(404, "INVITE_NOT_FOUND", "This invite is invalid or has expired");
      }

      const existingUser = await prisma.user.findUnique({ where: { email: invite.email } });
      if (existingUser) {
        throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists. Please log in instead.");
      }

      const passwordHash = await hashPassword(input.password);
      const { user } = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { name: input.name, email: invite.email, passwordHash } });
        await tx.membership.create({
          data: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role, status: "ACTIVE" },
        });
        await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
        return { user };
      });

      establishSession(reply, user.id);
      reply.code(201).send({ user: { id: user.id, name: user.name, email: user.email } });
    },
  });
}
