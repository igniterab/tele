import { prisma } from "../../db/client.js";
import { randomToken } from "../../lib/tokens.js";
import { ApiError } from "../../plugins/error-handler.js";
import type { Role } from "@tele/shared";

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export async function listMembers(workspaceId: string) {
  const members = await prisma.membership.findMany({
    where: { workspaceId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function createInvite(workspaceId: string, email: string, role: Role) {
  const existingMember = await prisma.membership.findFirst({
    where: { workspaceId, user: { email } },
  });
  if (existingMember) throw new ApiError(409, "ALREADY_MEMBER", "This person is already a member");

  const token = randomToken(24);
  const invite = await prisma.invite.create({
    data: { workspaceId, email, role, token, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });
  return invite;
}

export async function updateMemberRole(workspaceId: string, membershipId: string, role: Role, actingUserId: string) {
  const membership = await prisma.membership.findFirst({ where: { id: membershipId, workspaceId } });
  if (!membership) throw new ApiError(404, "NOT_FOUND", "Member not found");
  if (membership.userId === actingUserId && role !== "ADMIN") {
    const adminCount = await prisma.membership.count({ where: { workspaceId, role: "ADMIN" } });
    if (adminCount <= 1) throw new ApiError(400, "LAST_ADMIN", "Workspace must have at least one admin");
  }
  return prisma.membership.update({ where: { id: membershipId }, data: { role } });
}

export async function removeMember(workspaceId: string, membershipId: string, actingUserId: string) {
  const membership = await prisma.membership.findFirst({ where: { id: membershipId, workspaceId } });
  if (!membership) throw new ApiError(404, "NOT_FOUND", "Member not found");
  if (membership.userId === actingUserId) {
    throw new ApiError(400, "CANNOT_REMOVE_SELF", "You cannot remove yourself from the workspace");
  }
  if (membership.role === "ADMIN") {
    const adminCount = await prisma.membership.count({ where: { workspaceId, role: "ADMIN" } });
    if (adminCount <= 1) throw new ApiError(400, "LAST_ADMIN", "Workspace must have at least one admin");
  }
  await prisma.membership.delete({ where: { id: membershipId } });
}
