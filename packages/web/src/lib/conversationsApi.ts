import { api } from "./api";
import type { ConversationDTO, ConversationStatus, Channel, MessageDTO } from "@tele/shared";

export interface ConversationFilters {
  status?: ConversationStatus;
  channel?: Channel;
  unassigned?: boolean;
}

function buildQuery(filters: ConversationFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.unassigned) params.set("unassigned", "true");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const conversationsApi = {
  list: (workspaceId: string, filters: ConversationFilters) =>
    api
      .get<{ conversations: ConversationDTO[] }>(
        `/api/workspaces/${workspaceId}/conversations${buildQuery(filters)}`,
      )
      .then((r) => r.conversations),

  get: (workspaceId: string, conversationId: string) =>
    api
      .get<{ conversation: ConversationDTO }>(`/api/workspaces/${workspaceId}/conversations/${conversationId}`)
      .then((r) => r.conversation),

  messages: (workspaceId: string, conversationId: string, after?: string) =>
    api
      .get<{ messages: MessageDTO[] }>(
        `/api/workspaces/${workspaceId}/conversations/${conversationId}/messages${after ? `?after=${after}` : ""}`,
      )
      .then((r) => r.messages),

  sendMessage: (workspaceId: string, conversationId: string, bodyHtml: string) =>
    api
      .post<{ message: MessageDTO }>(`/api/workspaces/${workspaceId}/conversations/${conversationId}/messages`, {
        bodyHtml,
      })
      .then((r) => r.message),

  markRead: (workspaceId: string, conversationId: string) =>
    api.post(`/api/workspaces/${workspaceId}/conversations/${conversationId}/read`),

  refreshSummary: (workspaceId: string, conversationId: string) =>
    api
      .post<{ conversation: ConversationDTO }>(
        `/api/workspaces/${workspaceId}/conversations/${conversationId}/summarize`,
      )
      .then((r) => r.conversation),

  assign: (workspaceId: string, conversationId: string, assigneeId: string | null) =>
    api
      .patch<{ conversation: ConversationDTO }>(
        `/api/workspaces/${workspaceId}/conversations/${conversationId}/assign`,
        { assigneeId },
      )
      .then((r) => r.conversation),

  setStatus: (workspaceId: string, conversationId: string, status: ConversationStatus) =>
    api
      .patch<{ conversation: ConversationDTO }>(
        `/api/workspaces/${workspaceId}/conversations/${conversationId}/status`,
        { status },
      )
      .then((r) => r.conversation),

  snooze: (workspaceId: string, conversationId: string, snoozedUntil: Date) =>
    api
      .patch<{ conversation: ConversationDTO }>(
        `/api/workspaces/${workspaceId}/conversations/${conversationId}/snooze`,
        { snoozedUntil: snoozedUntil.toISOString() },
      )
      .then((r) => r.conversation),
};
