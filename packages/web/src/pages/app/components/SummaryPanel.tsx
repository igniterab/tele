import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConversationDTO } from "@tele/shared";
import { conversationsApi } from "../../../lib/conversationsApi";

export default function SummaryPanel({
  conversation,
  workspaceId,
}: {
  conversation: ConversationDTO;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setError(false);
    try {
      const updated = await conversationsApi.refreshSummary(workspaceId, conversation.id);
      queryClient.setQueryData(["conversation", workspaceId, conversation.id], updated);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <aside className="w-72 shrink-0 border-l border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI Summary</h3>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && (
        <div className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">Couldn't refresh summary</div>
      )}
      {!conversation.summary ? (
        <p className="mt-2 text-xs text-slate-400">
          No summary yet. One will be generated automatically as the conversation grows.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {conversation.summaryStatus && conversation.summaryStatus !== "FRESH" && (
            <div className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              {conversation.summaryStatus === "STALE" ? "May be outdated" : "Summary generation failed — showing last known summary"}
            </div>
          )}
          <div>
            <div className="text-[11px] font-medium text-slate-500">What they want</div>
            <p className="mt-0.5 text-sm text-slate-800">{conversation.summary.whatUserWants}</p>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500">What's been tried</div>
            <p className="mt-0.5 text-sm text-slate-800">{conversation.summary.whatsBeenTried}</p>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500">Current status</div>
            <p className="mt-0.5 text-sm text-slate-800">{conversation.summary.currentStatus}</p>
          </div>
          {conversation.summaryUpdatedAt && (
            <div className="text-[10px] text-slate-400">
              Updated {new Date(conversation.summaryUpdatedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
