import { prisma } from "../../db/client.js";
import type { AnalyticsDTO } from "@tele/shared";
import type { Channel, ConversationStatus } from "@tele/shared";

const TREND_DAYS = 14;

/**
 * Workspace-scoped support analytics. Every query is filtered by workspaceId
 * (resolved server-side from the membership), so this stays within the tenant
 * isolation boundary like every other dashboard read.
 */
export async function getAnalytics(workspaceId: string): Promise<AnalyticsDTO> {
  const [byStatusRaw, byChannelRaw, contacts, messages, publishedArticles, unassigned, perDayRaw, workloadRaw] =
    await Promise.all([
      prisma.conversation.groupBy({ by: ["status"], where: { workspaceId }, _count: { _all: true } }),
      prisma.conversation.groupBy({ by: ["channel"], where: { workspaceId }, _count: { _all: true } }),
      prisma.contact.count({ where: { workspaceId } }),
      prisma.message.count({ where: { workspaceId } }),
      prisma.kbArticle.count({ where: { workspaceId, status: "PUBLISHED" } }),
      prisma.conversation.count({ where: { workspaceId, assigneeId: null, status: "OPEN" } }),
      prisma.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT date_trunc('day', "createdAt")::date AS day, count(*)::int AS count
        FROM conversations
        WHERE "workspaceId" = ${workspaceId}
          AND "createdAt" >= (now() - (${TREND_DAYS - 1} || ' days')::interval)
        GROUP BY day
        ORDER BY day
      `,
      prisma.$queryRaw<{ name: string; count: bigint }[]>`
        SELECT u.name AS name, count(*)::int AS count
        FROM conversations c
        JOIN users u ON u.id = c."assigneeId"
        WHERE c."workspaceId" = ${workspaceId}
        GROUP BY u.name
        ORDER BY count DESC, u.name ASC
        LIMIT 8
      `,
    ]);

  const statusCount = (s: ConversationStatus) =>
    byStatusRaw.find((r) => r.status === s)?._count._all ?? 0;

  const open = statusCount("OPEN");
  const snoozed = statusCount("SNOOZED");
  const resolved = statusCount("RESOLVED");
  const conversations = open + snoozed + resolved;

  const byStatus: AnalyticsDTO["byStatus"] = (["OPEN", "SNOOZED", "RESOLVED"] as ConversationStatus[]).map((status) => ({
    status,
    count: statusCount(status),
  }));

  const byChannel: AnalyticsDTO["byChannel"] = (["CHAT", "EMAIL"] as Channel[]).map((channel) => ({
    channel,
    count: byChannelRaw.find((r) => r.channel === channel)?._count._all ?? 0,
  }));

  // Fill the trend to a continuous 14-day window (days with zero conversations
  // are absent from the SQL result).
  const perDayMap = new Map(perDayRaw.map((r) => [isoDay(r.day), Number(r.count)]));
  const conversationsPerDay: AnalyticsDTO["conversationsPerDay"] = [];
  const today = new Date();
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = isoDay(d);
    conversationsPerDay.push({ date: key, count: perDayMap.get(key) ?? 0 });
  }

  return {
    totals: { conversations, open, snoozed, resolved, unassigned, contacts, messages, publishedArticles },
    resolutionRate: conversations > 0 ? resolved / conversations : 0,
    avgMessagesPerConversation: conversations > 0 ? messages / conversations : 0,
    byChannel,
    byStatus,
    conversationsPerDay,
    agentWorkload: workloadRaw.map((r) => ({ name: r.name, count: Number(r.count) })),
  };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
