import { Redis } from "ioredis";
import type { RedisOptions } from "bullmq";
import { env } from "../env.js";

// Plain options (not a shared client instance) for BullMQ, which bundles its own
// ioredis version — passing a live client from our ioredis install trips up the
// type checker across the two copies. Each Queue/Worker opens its own connection.
export const bullConnectionOptions: RedisOptions = (() => {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    username: url.username || undefined,
    maxRetriesPerRequest: null,
  };
})();

// A real client, used for things outside BullMQ (Socket.IO's Redis adapter, which
// wants live ioredis clients to duplicate() from).
export const redisConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
