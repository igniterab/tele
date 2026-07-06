import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
// The structured-output helper is typed against zod's v4 API surface, which the
// installed zod 3.25.x exposes via this subpath preview — kept isolated to this
// file; the rest of the app uses plain zod v3 (`from "zod"`).
import { z } from "zod/v4";
import { prisma } from "../../db/client.js";
import { env } from "../../env.js";
import { logger } from "../../logger.js";
import { getEmitter } from "../../realtime/emitter.js";
import { conversationRoom } from "../../realtime/rooms.js";
import type { ConversationSummaryPayload, SummaryStatus } from "@tele/shared";

const SummarySchema = z.object({
  whatUserWants: z.string().describe("What the customer is trying to accomplish, in a few words to one short sentence"),
  whatsBeenTried: z.string().describe("What's been discussed or attempted so far, one short sentence"),
  currentStatus: z.string().describe("Where things currently stand, one short sentence"),
});

const MAX_RECENT_MESSAGES = 30;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_TOKENS = 400;

let client: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
  return client;
}

function senderLabel(senderType: string): string {
  if (senderType === "AGENT") return "Agent";
  if (senderType === "CONTACT") return "Customer";
  return "System";
}

async function broadcastSummary(conversationId: string, summary: ConversationSummaryPayload | null, status: SummaryStatus, updatedAt: Date) {
  try {
    getEmitter()
      .of("/agent")
      .to(conversationRoom(conversationId))
      .emit("conversation:summary_updated", {
        conversationId,
        summary: summary as ConversationSummaryPayload,
        summaryStatus: status,
        summaryUpdatedAt: updatedAt.toISOString(),
      });
  } catch (err) {
    logger.warn({ err, conversationId }, "failed to broadcast summary update");
  }
}

/**
 * Debounced by the caller (see queues/index.ts enqueueSummarize). Safe to call
 * repeatedly for the same conversation — skips the LLM call entirely if
 * nothing has changed since the last successful summary.
 */
export async function summarizeConversation(conversationId: string): Promise<void> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return;

  if (conversation.summaryUpdatedAt && conversation.summaryUpdatedAt >= conversation.lastMessageAt) {
    return; // already summarized everything that's happened so far
  }

  const anthropic = getClient();
  if (!anthropic) {
    logger.warn({ conversationId }, "ANTHROPIC_API_KEY not set — skipping AI summarization (stub mode)");
    return;
  }

  const recent = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: MAX_RECENT_MESSAGES,
  });
  if (recent.length === 0) return;
  recent.reverse();

  const priorSummary = conversation.summary as ConversationSummaryPayload | null;
  const transcript = recent.map((m) => `${senderLabel(m.senderType)}: ${m.bodyText}`).join("\n");
  const userContent = [
    priorSummary
      ? `Previous summary:\n- What they want: ${priorSummary.whatUserWants}\n- What's been tried: ${priorSummary.whatsBeenTried}\n- Status: ${priorSummary.currentStatus}`
      : null,
    `Recent messages (oldest first):\n${transcript}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const response = await anthropic.messages.parse(
      {
        model: env.ANTHROPIC_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system:
          "You summarize customer support conversations for a support agent who is about to read this thread for the first time. Be concise: a few words to one short sentence per field. Base the summary only on the messages provided, not on assumptions.",
        messages: [{ role: "user", content: userContent }],
        output_config: { format: zodOutputFormat(SummarySchema) },
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );

    const parsed = response.parsed_output;
    if (!parsed) throw new Error("model response did not include parsed_output");

    const updatedAt = new Date();
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { summary: parsed, summaryStatus: "FRESH", summaryUpdatedAt: updatedAt },
    });
    await broadcastSummary(conversationId, parsed, "FRESH", updatedAt);
  } catch (err) {
    logger.warn({ err, conversationId }, "AI summarization failed — keeping last-good summary");
    const fallbackStatus: SummaryStatus = conversation.summary ? "STALE" : "FAILED";
    const updatedAt = new Date();
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { summaryStatus: fallbackStatus },
    });
    await broadcastSummary(conversationId, priorSummary, fallbackStatus, updatedAt);
    throw err; // let BullMQ's configured retry (attempts: 2, backoff) take over
  }
}
