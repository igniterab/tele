import { prisma } from "../../db/client.js";
import { getEmitter } from "../../realtime/emitter.js";
import { workspaceRoom } from "../../realtime/rooms.js";
import { toConversationDTO } from "./mappers.js";
import { ApiError } from "../../plugins/error-handler.js";
import { logger } from "../../logger.js";
import type { Channel, ConversationStatus } from "@tele/shared";

export interface ListConversationsFilters {
  channel?: Channel;
  status?: ConversationStatus;
  assigneeId?: string;
  unassigned?: boolean;
  cursor?: string;
  limit: number;
}

export async function listConversations(workspaceId: string, filters: ListConversationsFilters) {
  const cursorConvo = filters.cursor
    ? await prisma.conversation.findUnique({ where: { id: filters.cursor } })
    : null;

  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId,
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.unassigned ? { assigneeId: null } : filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      ...(cursorConvo ? { lastMessageAt: { lt: cursorConvo.lastMessageAt } } : {}),
    },
    include: { contact: true, assignee: true },
    orderBy: { lastMessageAt: "desc" },
    take: filters.limit,
  });

  const unreadCounts = conversations.length
    ? await prisma.message.groupBy({
        by: ["conversationId"],
        where: {
          conversationId: { in: conversations.map((c) => c.id) },
          senderType: "CONTACT",
          readAt: null,
        },
        _count: { _all: true },
      })
    : [];
  const unreadByConvo = new Map(unreadCounts.map((u) => [u.conversationId, u._count._all]));

  return conversations.map((c) => toConversationDTO({ ...c, _unreadCount: unreadByConvo.get(c.id) ?? 0 }));
}

export async function getConversation(workspaceId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    include: { contact: true, assignee: true },
  });
  if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
  const unread = await prisma.message.count({
    where: { conversationId, senderType: "CONTACT", readAt: null },
  });
  return toConversationDTO({ ...conversation, _unreadCount: unread });
}

async function broadcastUpdate(workspaceId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    include: { contact: true, assignee: true },
  });
  if (!conversation) return;
  const unread = await prisma.message.count({ where: { conversationId, senderType: "CONTACT", readAt: null } });
  try {
    getEmitter()
      .of("/agent")
      .to(workspaceRoom(workspaceId))
      .emit("conversation:updated", toConversationDTO({ ...conversation, _unreadCount: unread }));
  } catch (err) {
    logger.warn({ err }, "failed to broadcast conversation update");
  }
}

export async function assignConversation(workspaceId: string, conversationId: string, assigneeId: string | null) {
  if (assigneeId) {
    const membership = await prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: assigneeId } },
    });
    if (!membership) throw new ApiError(400, "INVALID_ASSIGNEE", "Assignee must be a workspace member");
  }
  const existing = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Conversation not found");

  await prisma.conversation.update({ where: { id: conversationId }, data: { assigneeId } });
  await broadcastUpdate(workspaceId, conversationId);
  return getConversation(workspaceId, conversationId);
}

export async function updateConversationStatus(workspaceId: string, conversationId: string, status: ConversationStatus) {
  const existing = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Conversation not found");

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status, snoozedUntil: status === "SNOOZED" ? existing.snoozedUntil : null },
  });
  await broadcastUpdate(workspaceId, conversationId);
  return getConversation(workspaceId, conversationId);
}

export async function snoozeConversation(workspaceId: string, conversationId: string, snoozedUntil: Date) {
  const existing = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
  if (snoozedUntil.getTime() <= Date.now()) {
    throw new ApiError(400, "INVALID_SNOOZE_TIME", "Snooze time must be in the future");
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "SNOOZED", snoozedUntil },
  });
  await broadcastUpdate(workspaceId, conversationId);
  return getConversation(workspaceId, conversationId);
}

/** Repeatable maintenance job: reopen conversations whose snooze window has passed. */
export async function wakeSnoozedConversations(): Promise<number> {
  const due = await prisma.conversation.findMany({
    where: { status: "SNOOZED", snoozedUntil: { lte: new Date() } },
    select: { id: true, workspaceId: true },
  });
  for (const conv of due) {
    await prisma.conversation.update({ where: { id: conv.id }, data: { status: "OPEN", snoozedUntil: null } });
    await broadcastUpdate(conv.workspaceId, conv.id);
  }
  return due.length;
}

/** Finds the contact's current chat conversation, or opens a new one. Used by the widget. */
export async function getOrCreateChatConversation(workspaceId: string, contactId: string) {
  const existing = await prisma.conversation.findFirst({
    where: { workspaceId, contactId, channel: "CHAT", status: { not: "RESOLVED" } },
    orderBy: { lastMessageAt: "desc" },
  });
  if (existing) return existing;

  return prisma.conversation.create({
    data: { workspaceId, contactId, channel: "CHAT", status: "OPEN" },
  });
}
