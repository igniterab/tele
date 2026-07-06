import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MessageDTO } from "@tele/shared";
import { conversationsApi } from "../../../lib/conversationsApi";
import { membersApi } from "../../../lib/membersApi";
import { getAgentSocket } from "../../../lib/socket";
import { useAuth } from "../../../lib/auth";
import SummaryPanel from "./SummaryPanel";

interface Props {
  workspaceId: string;
  conversationId: string;
}

export default function ConversationDetail({ workspaceId, conversationId }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const conversationQuery = useQuery({
    queryKey: ["conversation", workspaceId, conversationId],
    queryFn: () => conversationsApi.get(workspaceId, conversationId),
  });

  const messagesQuery = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => conversationsApi.messages(workspaceId, conversationId),
  });

  const membersQuery = useQuery({
    queryKey: ["members", workspaceId],
    queryFn: () => membersApi.list(workspaceId),
    staleTime: 60_000,
  });

  const conversation = conversationQuery.data;
  const messages = messagesQuery.data ?? [];

  useEffect(() => {
    const socket = getAgentSocket(workspaceId);
    socket.emit("conversation:join", conversationId);
    conversationsApi.markRead(workspaceId, conversationId).catch(() => {});

    function onMessageNew(msg: MessageDTO) {
      if (msg.conversationId !== conversationId) return;
      queryClient.setQueryData<MessageDTO[]>(["messages", conversationId], (prev) => {
        if (!prev) return [msg];
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (msg.senderType === "CONTACT") {
        conversationsApi.markRead(workspaceId, conversationId).catch(() => {});
      }
    }

    function onTypingStart(payload: { conversationId: string; senderType: string; senderName: string }) {
      if (payload.conversationId !== conversationId || payload.senderType === "AGENT") return;
      setTypingFrom(payload.senderName);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTypingFrom(null), 4000);
    }

    function onTypingStop(payload: { conversationId: string }) {
      if (payload.conversationId !== conversationId) return;
      setTypingFrom(null);
    }

    function onMessageRead(payload: { conversationId: string; readAt: string; readBy: string }) {
      if (payload.conversationId !== conversationId) return;
      queryClient.setQueryData<MessageDTO[]>(["messages", conversationId], (prev) =>
        prev?.map((m) => (m.senderType !== payload.readBy && !m.readAt ? { ...m, readAt: payload.readAt } : m)),
      );
    }

    function onSummaryUpdated(payload: {
      conversationId: string;
      summary: unknown;
      summaryStatus: string;
      summaryUpdatedAt: string;
    }) {
      if (payload.conversationId !== conversationId) return;
      queryClient.setQueryData(["conversation", workspaceId, conversationId], (prev: typeof conversation) =>
        prev
          ? {
              ...prev,
              summary: payload.summary as typeof prev.summary,
              summaryStatus: payload.summaryStatus as typeof prev.summaryStatus,
              summaryUpdatedAt: payload.summaryUpdatedAt,
            }
          : prev,
      );
    }

    // On every (re)connect: re-join the conversation room (a reconnected socket
    // is a fresh server-side socket with no room memberships) and reconcile any
    // messages missed while the socket was down — re-fetch strictly after the
    // last message we hold (composite (createdAt,id) cursor server-side) and
    // merge, deduping by id. Socket.IO fires "connect" on the initial connect
    // and on every reconnect, so this is the catch-up path the live socket can't
    // guarantee on its own.
    async function onConnect() {
      socket.emit("conversation:join", conversationId);
      try {
        const cached = queryClient.getQueryData<MessageDTO[]>(["messages", conversationId]);
        const lastId = cached?.length ? cached[cached.length - 1].id : undefined;
        const missed = await conversationsApi.messages(workspaceId, conversationId, lastId);
        if (missed.length) {
          queryClient.setQueryData<MessageDTO[]>(["messages", conversationId], (prev) => {
            const base = prev ?? [];
            const seen = new Set(base.map((m) => m.id));
            return [...base, ...missed.filter((m) => !seen.has(m.id))];
          });
        }
        conversationQuery.refetch();
      } catch {
        // best-effort; a later focus/refetch will still reconcile from Postgres
      }
    }

    socket.on("connect", onConnect);
    socket.on("message:new", onMessageNew);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("message:read", onMessageRead);
    socket.on("conversation:summary_updated", onSummaryUpdated);

    return () => {
      socket.emit("conversation:leave", conversationId);
      socket.off("connect", onConnect);
      socket.off("message:new", onMessageNew);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("message:read", onMessageRead);
      socket.off("conversation:summary_updated", onSummaryUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  function handleDraftChange(value: string) {
    setDraft(value);
    const socket = getAgentSocket(workspaceId);
    socket.emit("typing:start", { conversationId });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => socket.emit("typing:stop", { conversationId }), 2000);
  }

  async function send() {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const html = `<p>${escapeHtml(trimmed).replace(/\n/g, "<br/>")}</p>`;
      const message = await conversationsApi.sendMessage(workspaceId, conversationId, html);
      queryClient.setQueryData<MessageDTO[]>(["messages", conversationId], (prev) =>
        prev ? (prev.some((m) => m.id === message.id) ? prev : [...prev, message]) : [message],
      );
      setDraft("");
      getAgentSocket(workspaceId).emit("typing:stop", { conversationId });
    } finally {
      setSending(false);
    }
  }

  async function updateAssignee(assigneeId: string) {
    await conversationsApi.assign(workspaceId, conversationId, assigneeId || null);
    conversationQuery.refetch();
  }

  async function setStatus(status: "OPEN" | "RESOLVED") {
    await conversationsApi.setStatus(workspaceId, conversationId, status);
    conversationQuery.refetch();
  }

  async function snooze(hours: number) {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000);
    await conversationsApi.snooze(workspaceId, conversationId, until);
    conversationQuery.refetch();
  }

  const members = membersQuery.data ?? [];

  const header = useMemo(() => {
    if (!conversation) return null;
    return (
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {conversation.contact.name || conversation.contact.email || "Visitor"}
          </div>
          <div className="text-xs text-slate-400">
            {conversation.channel} · {conversation.status}
            {conversation.contact.email ? ` · ${conversation.contact.email}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-slate-200 px-2 py-1 text-xs"
            value={conversation.assigneeId ?? ""}
            onChange={(e) => updateAssignee(e.target.value)}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          {conversation.status !== "RESOLVED" ? (
            <button
              onClick={() => setStatus("RESOLVED")}
              className="rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700"
            >
              Resolve
            </button>
          ) : (
            <button
              onClick={() => setStatus("OPEN")}
              className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Reopen
            </button>
          )}
          <button
            onClick={() => snooze(4)}
            className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Snooze 4h
          </button>
        </div>
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, members]);

  if (conversationQuery.isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>;
  }
  if (!conversation) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Not found</div>;
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      {header}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {typingFrom && <div className="text-xs italic text-slate-400">{typingFrom} is typing…</div>}
          </div>
          <div className="border-t border-slate-200 p-3">
            <textarea
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Write a reply…"
              rows={3}
              className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={send}
                disabled={sending || !draft.trim()}
                className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
        <SummaryPanel conversation={conversation} />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: MessageDTO }) {
  const isAgent = message.senderType === "AGENT";
  const isSystem = message.senderType === "SYSTEM";
  if (isSystem) {
    return <div className="text-center text-xs text-slate-400">{message.bodyText}</div>;
  }
  return (
    <div className={`flex ${isAgent ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
          isAgent ? "bg-brand-600 text-white" : "bg-white text-slate-800 border border-slate-200"
        }`}
      >
        <div dangerouslySetInnerHTML={{ __html: message.bodyHtml }} />
        <div className={`mt-1 text-[10px] ${isAgent ? "text-brand-100" : "text-slate-400"}`}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {isAgent && (message.readAt ? " · Read" : " · Sent")}
        </div>
        {message.emailDeliveryStatus === "FAILED" && (
          <div className="mt-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
            Email delivery failed — retrying
          </div>
        )}
      </div>
    </div>
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
