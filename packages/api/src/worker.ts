import { Worker, type Job } from "bullmq";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { bullConnectionOptions } from "./queues/connection.js";
import {
  QueueNames,
  scheduleMaintenanceJobs,
  scheduleDomainVerificationJobs,
  type AiSummarizeJob,
  type DomainVerificationJob,
  type EmailInboundJob,
  type EmailOutboundJob,
} from "./queues/index.js";
import { initWorkerEmitter } from "./realtime/emitter.js";
import { processInboundEmail, processOutboundEmail } from "./modules/email/service.js";
import { wakeSnoozedConversations } from "./modules/conversations/service.js";
import { summarizeConversation } from "./modules/ai/summarize.js";
import { checkAllPendingDomains, checkAndAdvanceDomain } from "./modules/domains/service.js";

/**
 * Entry point for the BullMQ worker process — deliberately separate from
 * server.ts so it can be scaled independently of the HTTP/WebSocket-serving
 * API process (e.g. more worker replicas during an email/AI-summarize burst,
 * without needing more front-door capacity). Run with `npm run dev:worker`.
 */

initWorkerEmitter();

const workers: Worker[] = [];

workers.push(
  new Worker<EmailInboundJob>(
    QueueNames.EMAIL_INBOUND,
    async (job: Job<EmailInboundJob>) => {
      await processInboundEmail(job.data);
    },
    { connection: bullConnectionOptions, concurrency: 5 },
  ),
);

workers.push(
  new Worker<EmailOutboundJob>(
    QueueNames.EMAIL_OUTBOUND,
    async (job: Job<EmailOutboundJob>) => {
      await processOutboundEmail(job.data);
    },
    { connection: bullConnectionOptions, concurrency: 5 },
  ),
);

workers.push(
  new Worker<AiSummarizeJob>(
    QueueNames.AI_SUMMARIZE,
    async (job: Job<AiSummarizeJob>) => {
      await summarizeConversation(job.data.conversationId);
    },
    { connection: bullConnectionOptions, concurrency: 3 },
  ),
);

workers.push(
  new Worker<Partial<DomainVerificationJob>>(
    QueueNames.DOMAIN_VERIFICATION,
    async (job: Job<Partial<DomainVerificationJob>>) => {
      if (job.name === "check-one" && job.data.domainId) {
        await checkAndAdvanceDomain(job.data.domainId);
      } else {
        await checkAllPendingDomains();
      }
    },
    { connection: bullConnectionOptions, concurrency: 1 },
  ),
);

workers.push(
  new Worker(
    QueueNames.MAINTENANCE,
    async (job: Job) => {
      if (job.name === "wake-snoozed") {
        const woken = await wakeSnoozedConversations();
        if (woken > 0) logger.info({ woken }, "woke snoozed conversations");
      }
    },
    { connection: bullConnectionOptions, concurrency: 1 },
  ),
);

for (const worker of workers) {
  worker.on("failed", (job, err) => {
    logger.warn({ queue: worker.name, jobId: job?.id, err }, "job failed");
  });
  worker.on("error", (err) => {
    logger.error({ queue: worker.name, err }, "worker error");
  });
}

await scheduleMaintenanceJobs();
await scheduleDomainVerificationJobs();

logger.info({ queues: workers.map((w) => w.name) }, "worker process ready");

async function shutdown() {
  logger.info("worker shutting down");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

void env; // keep env import for its startup validation side effect
