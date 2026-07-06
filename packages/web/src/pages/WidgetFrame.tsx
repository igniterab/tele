import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { KbArticleDTO, MessageDTO } from "@tele/shared";
import { widgetApi } from "../lib/widgetApi";
import { getWidgetSocket } from "../lib/widgetSocket";

const SUGGEST_DEBOUNCE_MS = 300;
const SUGGEST_MIN_CHARS = 4;

function storageKey(workspaceSlug: string) {
  return `tele.visitorToken.${workspaceSlug}`;
}

export default function WidgetFrame() {
  const [params] = useSearchParams();
  const workspaceSlug = params.get("workspaceSlug") ?? "";

  const [token, setToken] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [agentOnline, setAgentOnline] = useState(false);
  const [typing, setTyping] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState<KbArticleDTO[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const unreadRef = useRef(0);
  const panelOpenRef = useRef(panelOpen);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const suggestTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const notifyUnread = useCallback((count: number) => {
    unreadRef.current = count;
    window.parent.postMessage({ type: "tele:unread", count }, "*");
  }, []);

  useEffect(() => {
    function onParentMessage(event: MessageEvent) {
      if (event.data?.type === "tele:panel-opened") {
        setPanelOpen(true);
      }
    }
    window.addEventListener("message", onParentMessage);
    return () => window.removeEventListener("message", onParentMessage);
  }, []);

  // Mark the agent's messages read whenever the widget is open AND this page is
  // actually on screen — including when the visitor switches *back* to this
  // tab/window (focus / visibilitychange), not only when a new message arrives.
  // Without the focus/visibility listeners, a reply that lands while the visitor
  // is looking elsewhere would never be marked read, so the agent stays on "Sent".
  useEffect(() => {
    if (!ready || !token || !conversationId) return;
    const tok = token;
    const convoId = conversationId;
    function markIfActive() {
      if (panelOpenRef.current && document.visibilityState === "visible") {
        notifyUnread(0);
        widgetApi.markRead(tok, convoId).catch(() => {});
      }
    }
    markIfActive();
    window.addEventListener("focus", markIfActive);
    document.addEventListener("visibilitychange", markIfActive);
    return () => {
      window.removeEventListener("focus", markIfActive);
      document.removeEventListener("visibilitychange", markIfActive);
    };
  }, [ready, token, conversationId, panelOpen, messages.length, notifyUnread]);

  useEffect(() => {
    if (!workspaceSlug) return;
    let cancelled = false;

    async function bootstrap() {
      const existing = localStorage.getItem(storageKey(workspaceSlug));
      const session = await widgetApi.bootstrapSession(workspaceSlug, existing);
      if (cancelled) return;
      localStorage.setItem(storageKey(workspaceSlug), session.visitorToken);
      setToken(session.visitorToken);

      const conversation = await widgetApi.getOrCreateConversation(session.visitorToken);
      if (cancelled) return;
      setConversationId(conversation.id);

      const history = await widgetApi.listMessages(session.visitorToken, conversation.id);
      if (cancelled) return;
      setMessages(history);
      setReady(true);
    }

    bootstrap().catch((err) => console.error("[Tele widget] failed to start session", err));
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  useEffect(() => {
    if (!token || !conversationId) return;
    const tok = token;
    const convoId = conversationId;
    const socket = getWidgetSocket(tok);
    socket.emit("conversation:join", convoId);

    function onMessageNew(msg: MessageDTO) {
      if (msg.conversationId !== convoId) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      // When active, the markIfActive effect (keyed on messages.length) marks it
      // read; when not, surface an unread badge instead.
      const active = panelOpenRef.current && document.visibilityState === "visible";
      if (msg.senderType === "AGENT" && !active) {
        notifyUnread(unreadRef.current + 1);
      }
    }

    function onTypingStart(payload: { conversationId: string; senderType: string }) {
      if (payload.conversationId !== conversationId || payload.senderType !== "AGENT") return;
      setTyping(true);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTyping(false), 4000);
    }
    function onTypingStop(payload: { conversationId: string }) {
      if (payload.conversationId !== conversationId) return;
      setTyping(false);
    }
    function onPresence(payload: { agentIds?: string[] }) {
      if (payload.agentIds) setAgentOnline(payload.agentIds.length > 0);
    }
    function onMessageRead(payload: { conversationId: string; readAt: string; readBy: string }) {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => (m.senderType !== payload.readBy && !m.readAt ? { ...m, readAt: payload.readAt } : m)),
      );
    }

    socket.on("message:new", onMessageNew);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("presence:update", onPresence);
    socket.on("message:read", onMessageRead);

    return () => {
      socket.off("message:new", onMessageNew);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("presence:update", onPresence);
      socket.off("message:read", onMessageRead);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, conversationId]);

  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  function handleDraftChange(value: string) {
    setDraft(value);
    if (token && conversationId) {
      const socket = getWidgetSocket(token);
      socket.emit("typing:start", { conversationId });
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => socket.emit("typing:stop", { conversationId }), 2000);
    }

    clearTimeout(suggestTimeoutRef.current);
    const trimmed = value.trim();
    if (trimmed.length < SUGGEST_MIN_CHARS) {
      setSuggestions([]);
      return;
    }
    suggestTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/public/kb/${workspaceSlug}/search?q=${encodeURIComponent(trimmed)}&limit=3`);
        const data = await res.json();
        setSuggestions(data.articles ?? []);
      } catch {
        setSuggestions([]);
      }
    }, SUGGEST_DEBOUNCE_MS);
  }

  async function send() {
    const trimmed = draft.trim();
    if (!trimmed || !token || !conversationId) return;
    const html = `<p>${escapeHtml(trimmed)}</p>`;
    const message = await widgetApi.sendMessage(token, conversationId, html);
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    setDraft("");
    setSuggestions([]);
    getWidgetSocket(token).emit("typing:stop", { conversationId });
  }

  if (!workspaceSlug) {
    return <div className="p-4 text-sm text-red-600">Missing workspaceSlug</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-white font-sans">
      <div className="bg-brand-600 px-4 py-3 text-white">
        <div className="text-sm font-semibold">Chat with us</div>
        <div className="flex items-center gap-1.5 text-xs text-brand-100">
          {typing ? (
            <>
              <TypingDots />
              <span>Typing…</span>
            </>
          ) : (
            <span>{agentOnline ? "We're online" : "We'll reply as soon as we can"}</span>
          )}
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {!ready && <div className="text-center text-xs text-slate-400">Connecting…</div>}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {typing && <div className="text-xs italic text-slate-400">Agent is typing…</div>}
      </div>
      {suggestions.length > 0 && (
        <div className="border-t border-slate-200 bg-slate-50 p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Suggested articles</div>
          <div className="mt-1 space-y-1">
            {suggestions.map((a) => (
              <a
                key={a.id}
                href={`/kb/${workspaceSlug}/${a.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate rounded bg-white px-2 py-1 text-xs text-brand-700 border border-slate-200 hover:border-brand-300"
              >
                {a.title}
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="border-t border-slate-200 p-2">
        <textarea
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Type a message…"
          className="w-full resize-none rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
        />
        <div className="mt-1 flex justify-end">
          <button
            onClick={send}
            disabled={!draft.trim()}
            className="rounded bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: MessageDTO }) {
  const isMine = message.senderType === "CONTACT";
  if (message.senderType === "SYSTEM") {
    return <div className="text-center text-xs text-slate-400">{message.bodyText}</div>;
  }
  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${
          isMine ? "bg-brand-600 text-white" : "border border-slate-200 bg-slate-50 text-slate-800"
        }`}
      >
        <div dangerouslySetInnerHTML={{ __html: message.bodyHtml }} />
        {isMine && <div className="mt-0.5 text-[10px] text-brand-100">{message.readAt ? "Seen" : "Sent"}</div>}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      <span className="h-1 w-1 animate-bounce rounded-full bg-brand-100 [animation-delay:-0.3s]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-brand-100 [animation-delay:-0.15s]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-brand-100" />
    </span>
  );
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
