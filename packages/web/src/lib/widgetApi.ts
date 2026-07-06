import type { ConversationDTO, MessageDTO } from "@tele/shared";

export class WidgetApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json() : undefined;
  if (!res.ok) {
    throw new WidgetApiError(res.status, payload?.error?.message ?? res.statusText);
  }
  return payload as T;
}

export interface WidgetSessionResponse {
  visitorToken: string;
  contact: { id: string; name: string | null; email: string | null };
  workspace: { id: string; name: string; slug: string };
}

export const widgetApi = {
  bootstrapSession: (workspaceSlug: string, existingToken: string | null) =>
    request<WidgetSessionResponse>("POST", "/api/public/widget/session", null, {
      workspaceSlug,
      visitorToken: existingToken ?? undefined,
    }),

  getOrCreateConversation: (token: string) =>
    request<{ conversation: ConversationDTO }>("GET", "/api/public/widget/conversation", token).then(
      (r) => r.conversation,
    ),

  listMessages: (token: string, conversationId: string) =>
    request<{ messages: MessageDTO[] }>(
      "GET",
      `/api/public/widget/conversations/${conversationId}/messages`,
      token,
    ).then((r) => r.messages),

  sendMessage: (token: string, conversationId: string, bodyHtml: string) =>
    request<{ message: MessageDTO }>(
      "POST",
      `/api/public/widget/conversations/${conversationId}/messages`,
      token,
      { bodyHtml },
    ).then((r) => r.message),

  markRead: (token: string, conversationId: string) =>
    request("POST", `/api/public/widget/conversations/${conversationId}/read`, token),
};
