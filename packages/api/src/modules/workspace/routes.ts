import type { FastifyInstance } from "fastify";
import { inviteMemberSchema, updateMemberRoleSchema } from "@tele/shared";
import { createInvite, listMembers, removeMember, updateMemberRole } from "./service.js";
import { sendMail } from "../../lib/mailer.js";
import { env } from "../../env.js";

export default async function workspaceRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/workspaces/:workspaceId/members",
    { preHandler: [fastify.authenticate, fastify.requireWorkspaceMember()] },
    async (req, reply) => {
      const members = await listMembers(req.workspace!.id);
      reply.send({ members });
    },
  );

  fastify.post(
    "/api/workspaces/:workspaceId/invites",
    { preHandler: [fastify.authenticate, fastify.requireWorkspaceMember("ADMIN")] },
    async (req, reply) => {
      const input = inviteMemberSchema.parse(req.body);
      const invite = await createInvite(req.workspace!.id, input.email, input.role);

      const acceptUrl = `${env.WEB_ORIGIN}/accept-invite/${invite.token}`;
      await sendMail({
        from: `Tele <no-reply@${req.workspace!.slug}.${env.EMAIL_DOMAIN}>`,
        to: input.email,
        subject: `You've been invited to join ${req.workspace!.name} on Tele`,
        text: `You've been invited to join ${req.workspace!.name} as ${input.role}. Accept: ${acceptUrl}`,
        html: `<p>You've been invited to join <strong>${req.workspace!.name}</strong> as ${input.role}.</p><p><a href="${acceptUrl}">Accept invite</a></p>`,
      });

      reply.code(201).send({
        invite: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt },
        acceptUrl,
      });
    },
  );

  fastify.patch(
    "/api/workspaces/:workspaceId/members/:membershipId",
    { preHandler: [fastify.authenticate, fastify.requireWorkspaceMember("ADMIN")] },
    async (req, reply) => {
      const { membershipId } = req.params as { membershipId: string };
      const input = updateMemberRoleSchema.parse(req.body);
      const updated = await updateMemberRole(req.workspace!.id, membershipId, input.role, req.authUser!.id);
      reply.send({ membership: updated });
    },
  );

  fastify.delete(
    "/api/workspaces/:workspaceId/members/:membershipId",
    { preHandler: [fastify.authenticate, fastify.requireWorkspaceMember("ADMIN")] },
    async (req, reply) => {
      const { membershipId } = req.params as { membershipId: string };
      await removeMember(req.workspace!.id, membershipId, req.authUser!.id);
      reply.send({ ok: true });
    },
  );
}
