import type { ConversationDTO, ConversationStatus, Channel } from "@tele/shared";
import type { ConversationFilters } from "../../../lib/conversationsApi";

interface Props {
  conversations: ConversationDTO[];
  isLoading: boolean;
  filters: ConversationFilters;
  onFiltersChange: (f: ConversationFilters) => void;
  selectedId?: string;
  onSelect: (id: string) => void;
}

const STATUS_TABS: { label: string; value: ConversationStatus | undefined }[] = [
  { label: "Open", value: "OPEN" },
  { label: "Snoozed", value: "SNOOZED" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "All", value: undefined },
];

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function ConversationList({
  conversations,
  isLoading,
  filters,
  onFiltersChange,
  selectedId,
  onSelect,
}: Props) {
  return (
    <div className="flex h-full w-80 flex-col border-r border-slate-100 bg-white/70">
      <div className="border-b border-slate-100 p-3">
        <div className="flex gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => onFiltersChange({ ...filters, status: tab.value })}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                filters.status === tab.value
                  ? "bg-brand-50 text-brand-700 shadow-sm"
                  : "text-slate-500 hover:bg-slate-100/80"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <select
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white py-1 text-xs"
          value={filters.channel ?? ""}
          onChange={(e) => onFiltersChange({ ...filters, channel: (e.target.value || undefined) as Channel | undefined })}
        >
          <option value="">All channels</option>
          <option value="CHAT">Chat</option>
          <option value="EMAIL">Email</option>
        </select>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="p-4 text-xs text-slate-400">Loading…</div>}
        {!isLoading && conversations.length === 0 && (
          <div className="p-4 text-xs text-slate-400">No conversations</div>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`block w-full border-b border-slate-50 px-3 py-3 text-left transition-colors hover:bg-slate-50 ${
              selectedId === c.id ? "bg-brand-50/70 shadow-[inset_2px_0_0_theme(colors.brand.500)]" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                {c.unreadCount > 0 && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />
                )}
                <span
                  className={`truncate text-sm ${
                    c.unreadCount > 0 ? "font-semibold text-slate-900" : "font-medium text-slate-800"
                  }`}
                >
                  {c.contact.name || c.contact.email || "Visitor"}
                </span>
              </span>
              <span className={`shrink-0 text-[11px] ${c.unreadCount > 0 ? "font-medium text-brand-700" : "text-slate-400"}`}>
                {timeAgo(c.lastMessageAt)}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  c.channel === "CHAT" ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"
                }`}
              >
                {c.channel}
              </span>
              {c.assigneeName && (
                <span className="truncate text-[11px] text-slate-400">→ {c.assigneeName}</span>
              )}
              {c.unreadCount > 0 && (
                <span className="ml-auto rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {c.unreadCount}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
