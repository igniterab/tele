import { useQuery } from "@tanstack/react-query";
import type { AnalyticsDTO } from "@tele/shared";
import { useWorkspace } from "../../lib/workspace";
import { analyticsApi } from "../../lib/analyticsApi";

// Chart palette — validated for CVD separation + contrast (dataviz skill).
// Primary magnitude bars use the app's brand periwinkle as a single hue;
// the status breakdown uses distinct, always-labeled hues.
const BRAND = "#7c3aed";
const STATUS_COLOR: Record<string, string> = {
  OPEN: "#7c3aed",
  SNOOZED: "#eda100",
  RESOLVED: "#16a34a",
};
const STATUS_LABEL: Record<string, string> = { OPEN: "Open", SNOOZED: "Snoozed", RESOLVED: "Resolved" };
const CHANNEL_LABEL: Record<string, string> = { CHAT: "Chat", EMAIL: "Email" };

export default function Dashboard() {
  const { workspaceId } = useWorkspace();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["analytics", workspaceId],
    queryFn: () => analyticsApi.get(workspaceId),
    refetchInterval: 30_000,
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <header className="mb-6">
          <h1 className="text-lg font-semibold tracking-tight text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">Support activity across this workspace.</p>
        </header>

        {isLoading && <div className="text-sm text-slate-400">Loading analytics…</div>}
        {isError && <div className="text-sm text-red-600">Couldn't load analytics.</div>}
        {data && <Analytics data={data} />}
      </div>
    </div>
  );
}

function Analytics({ data }: { data: AnalyticsDTO }) {
  const { totals } = data;
  return (
    <div className="animate-fade-in space-y-5">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Conversations" value={totals.conversations} />
        <StatTile label="Open" value={totals.open} accent="#7c3aed" />
        <StatTile label="Unassigned" value={totals.unassigned} accent={totals.unassigned > 0 ? "#eda100" : undefined} />
        <StatTile label="Resolution rate" value={`${Math.round(data.resolutionRate * 100)}%`} />
        <StatTile label="Avg msgs / convo" value={data.avgMessagesPerConversation.toFixed(1)} />
        <StatTile label="Contacts" value={totals.contacts} />
      </div>

      {/* Trend */}
      <Card title="New conversations" subtitle="Last 14 days">
        <TrendChart series={data.conversationsPerDay} />
      </Card>

      {/* Breakdowns */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="By channel">
          <BarList
            rows={data.byChannel.map((c) => ({ label: CHANNEL_LABEL[c.channel] ?? c.channel, value: c.count, color: BRAND }))}
          />
        </Card>
        <Card title="By status">
          <BarList
            rows={data.byStatus.map((s) => ({
              label: STATUS_LABEL[s.status] ?? s.status,
              value: s.count,
              color: STATUS_COLOR[s.status] ?? BRAND,
            }))}
          />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Agent workload" subtitle="Assigned conversations">
          {data.agentWorkload.length ? (
            <BarList rows={data.agentWorkload.map((a) => ({ label: a.name, value: a.count, color: BRAND }))} />
          ) : (
            <Empty>No conversations assigned to agents yet.</Empty>
          )}
        </Card>
        <Card title="Knowledge base">
          <div className="flex h-full items-center gap-6">
            <Figure value={totals.publishedArticles} label="Published articles" />
            <Figure value={totals.messages} label="Messages handled" />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function StatTile({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        {accent && <span className="h-2 w-2 rounded-full" style={{ background: accent }} />}
        <span className="text-2xl font-semibold tabular-nums text-slate-800">{value}</span>
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-3xl font-semibold tabular-nums text-slate-800">{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{label}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-xs text-slate-400">{children}</div>;
}

function TrendChart({ series }: { series: { date: string; count: number }[] }) {
  const max = Math.max(1, ...series.map((d) => d.count));
  return (
    <div>
      <div className="flex h-40 items-end gap-[3px]">
        {series.map((d) => {
          const pct = (d.count / max) * 100;
          return (
            <div key={d.date} className="group relative flex-1" title={`${formatDay(d.date)}: ${d.count}`}>
              <div
                className="w-full rounded-t-[4px] transition-[height] duration-300"
                style={{ height: `${Math.max(pct, d.count > 0 ? 4 : 0)}%`, minHeight: d.count > 0 ? 3 : 0, background: BRAND }}
              />
              {/* hover value */}
              <div className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white group-hover:block">
                {d.count}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400">
        <span>{formatDay(series[0]?.date)}</span>
        <span>{formatDay(series[Math.floor(series.length / 2)]?.date)}</span>
        <span>{formatDay(series[series.length - 1]?.date)}</span>
      </div>
    </div>
  );
}

function BarList({ rows }: { rows: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="w-20 shrink-0 truncate text-xs text-slate-500" title={r.label}>
            {r.label}
          </div>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value > 0 ? 6 : 0, background: r.color }}
            />
          </div>
          <div className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">{r.value}</div>
        </div>
      ))}
    </div>
  );
}

function formatDay(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
