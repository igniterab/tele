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
const ANTHROPIC_TIMEOUT_MS = 15_000;
// Local models can be slow on a cold load (weights paged into memory on the
// first call), so give Ollama a more generous ceiling than the hosted API.
const OLLAMA_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 400;

const SYSTEM_PROMPT =
  "You summarize customer support conversations for a support agent who is about to read this thread for the first time. Be concise: a few words to one short sentence per field. Base the summary only on the messages provided, not on assumptions.";

// Plain JSON Schema for Ollama's structured-output `format` param (mirrors
// SummarySchema above; Ollama doesn't use the Anthropic/zod helper).
const SUMMARY_JSON_SCHEMA = {
  type: "object",
  properties: {
    whatUserWants: { type: "string" },
    whatsBeenTried: { type: "string" },
    currentStatus: { type: "string" },
  },
  required: ["whatUserWants", "whatsBeenTried", "currentStatus"],
} as const;

let client: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
  return client;
}

type Provider = "ollama" | "anthropic";

// Ollama wins when configured (local, free, no key); otherwise Anthropic if a
// key is present; otherwise null → stub/no-op.
function activeProvider(): Provider | null {
  if (env.OLLAMA_BASE_URL) return "ollama";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

function senderLabel(senderType: string): string {
  if (senderType === "AGENT") return "Agent";
  if (senderType === "CONTACT") return "Customer";
  return "System";
}

/** Validate an arbitrary parsed object into a well-formed summary payload. */
function coerceSummary(parsed: unknown): ConversationSummaryPayload {
  if (!parsed || typeof parsed !== "object") throw new Error("summary output was not an object");
  const p = parsed as Record<string, unknown>;
  const field = (k: keyof ConversationSummaryPayload) => {
    const v = p[k];
    if (typeof v !== "string" || !v.trim()) throw new Error(`summary output missing field: ${String(k)}`);
    return v.trim();
  };
  return {
    whatUserWants: field("whatUserWants"),
    whatsBeenTried: field("whatsBeenTried"),
    currentStatus: field("currentStatus"),
  };
}

async function summarizeWithAnthropic(userContent: string): Promise<ConversationSummaryPayload> {
  const anthropic = getClient();
  if (!anthropic) throw new Error("Anthropic client not configured");
  const response = await anthropic.messages.parse(
    {
      model: env.ANTHROPIC_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
      output_config: { format: zodOutputFormat(SummarySchema) },
    },
    { timeout: ANTHROPIC_TIMEOUT_MS },
  );
  if (!response.parsed_output) throw new Error("model response did not include parsed_output");
  return coerceSummary(response.parsed_output);
}

async function summarizeWithOllama(userContent: string): Promise<ConversationSummaryPayload> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.OLLAMA_BASE_URL!.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        stream: false,
        // Ollama structured outputs: constrains generation to this JSON Schema.
        format: SUMMARY_JSON_SCHEMA,
        options: { temperature: 0.2, num_predict: MAX_OUTPUT_TOKENS },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content;
    if (!content) throw new Error("Ollama response had no message content");
    return coerceSummary(JSON.parse(content));
  } finally {
    clearTimeout(timer);
  }
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

  const provider = activeProvider();
  if (!provider) {
    logger.warn(
      { conversationId },
      "no AI provider configured (set OLLAMA_BASE_URL or ANTHROPIC_API_KEY) — skipping AI summarization (stub mode)",
    );
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
    const parsed =
      provider === "ollama" ? await summarizeWithOllama(userContent) : await summarizeWithAnthropic(userContent);

    const updatedAt = new Date();
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { summary: parsed as unknown as Record<string, string>, summaryStatus: "FRESH", summaryUpdatedAt: updatedAt },
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
