import { Queue } from "bullmq";
import { bullConnectionOptions } from "./connection.js";

export const QueueNames = {
  EMAIL_INBOUND: "email-inbound",
  EMAIL_OUTBOUND: "email-outbound",
  AI_SUMMARIZE: "ai-summarize",
  DOMAIN_VERIFICATION: "domain-verification",
  MAINTENANCE: "maintenance",
} as const;

export interface EmailInboundJob {
  workspaceSlugOrId: string;
  from: { email: string; name?: string };
  to: string[];
  subject: string;
  text: string;
  html: string;
  messageId: string;
  inReplyTo?: string;
  references?: string;
}

export interface EmailOutboundJob {
  messageId: string; // our Message.id, not the email Message-ID
}

export interface AiSummarizeJob {
  conversationId: string;
}

export interface DomainVerificationJob {
  domainId: string;
}

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
};

export const emailInboundQueue = new Queue<EmailInboundJob>(QueueNames.EMAIL_INBOUND, {
  connection: bullConnectionOptions,
  defaultJobOptions,
});

export const emailOutboundQueue = new Queue<EmailOutboundJob>(QueueNames.EMAIL_OUTBOUND, {
  connection: bullConnectionOptions,
  defaultJobOptions,
});

export const aiSummarizeQueue = new Queue<AiSummarizeJob>(QueueNames.AI_SUMMARIZE, {
  connection: bullConnectionOptions,
  defaultJobOptions: { ...defaultJobOptions, attempts: 2 },
});

export const domainVerificationQueue = new Queue<Partial<DomainVerificationJob>>(QueueNames.DOMAIN_VERIFICATION, {
  connection: bullConnectionOptions,
  defaultJobOptions: { attempts: 1 },
});

const CHECK_ALL_DOMAINS_JOB_ID = "check-all-domains";

/** Repeatable tick: re-checks every domain not yet ACTIVE. Idempotent to call on worker startup. */
export async function scheduleDomainVerificationJobs() {
  await domainVerificationQueue.add(
    "check-all",
    {},
    { jobId: CHECK_ALL_DOMAINS_JOB_ID, repeat: { every: 20_000 }, removeOnComplete: true },
  );
}

/** Manual "check now" trigger for a single domain (e.g. an admin clicking a recheck button). */
export async function enqueueDomainCheck(domainId: string) {
  await domainVerificationQueue.add("check-one", { domainId }, { jobId: `domain-check-${domainId}` });
}

// Generic repeatable-job queue for small periodic housekeeping tasks (currently
// just waking snoozed conversations past their snooze time). Kept separate from
// the feature queues above since it's not tied to one conversation/job's data.
export const maintenanceQueue = new Queue(QueueNames.MAINTENANCE, {
  connection: bullConnectionOptions,
  defaultJobOptions: { attempts: 1, removeOnComplete: { count: 20 }, removeOnFail: { count: 20 } },
});

const WAKE_SNOOZED_JOB_ID = "wake-snoozed-conversations";

/** Idempotent — safe to call on every worker startup (BullMQ dedupes by repeat + jobId). */
export async function scheduleMaintenanceJobs() {
  await maintenanceQueue.add(
    "wake-snoozed",
    {},
    { jobId: WAKE_SNOOZED_JOB_ID, repeat: { every: 60_000 }, removeOnComplete: true },
  );
}

const SUMMARIZE_DEBOUNCE_MS = 5000;

/**
 * Debounced enqueue: replaces any pending delayed job for this conversation so a
 * burst of messages results in one summarize call after things settle, not one per message.
 */
export async function enqueueSummarize(conversationId: string) {
  const jobId = `summarize-${conversationId}`; // BullMQ job IDs may not contain ":"
  // The fixed jobId debounces bursts to one run, but BullMQ refuses to re-add a
  // jobId that still exists in ANY state — including "completed"/"failed" — so a
  // finished job would silently block every future summarize for this
  // conversation. Clear the prior job before scheduling the next; skip only a
  // job that's actively running (it can't be removed, and it'll free its id on
  // completion via removeOnComplete below).
  const existing = await aiSummarizeQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== "active") {
      await existing.remove().catch(() => {});
    }
  }
  await aiSummarizeQueue.add(
    "summarize",
    { conversationId },
    { jobId, delay: SUMMARIZE_DEBOUNCE_MS, removeOnComplete: true, removeOnFail: true },
  );
}

export async function enqueueOutboundEmail(messageId: string) {
  await emailOutboundQueue.add("send", { messageId }, { jobId: `outbound-${messageId}` });
}

export async function enqueueInboundEmail(job: EmailInboundJob) {
  await emailInboundQueue.add("inbound", job);
}
