import type { ConversationDTO } from "@tele/shared";

export default function SummaryPanel({ conversation }: { conversation: ConversationDTO }) {
  return (
    <aside className="w-72 shrink-0 border-l border-slate-200 bg-slate-50 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI Summary</h3>
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
