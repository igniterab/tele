import { Emitter } from "@socket.io/redis-emitter";
import { redisConnection } from "../queues/connection.js";

/**
 * Shared "can broadcast to connected sockets" interface. In the API process
 * this is the real Socket.IO `Server` (set by `initRealtime`). In the worker
 * process (no HTTP server, no accepted connections of its own) it's a
 * Redis-backed `Emitter` — a write-only client that publishes onto the exact
 * same Redis channels the API process's Redis adapter is subscribed to, so
 * `.of(ns).to(room).emit(...)` reaches real connected clients either way.
 * Both expose the same `.of(namespace).to(room).emit(event, payload)` shape,
 * which is all any call site here actually uses.
 */
export interface BroadcastEmitter {
  of(namespace: string): {
    to(room: string): { emit(event: string, ...args: unknown[]): unknown };
  };
}

let emitter: BroadcastEmitter | undefined;

export function setBroadcastEmitter(instance: BroadcastEmitter) {
  emitter = instance;
}

export function initWorkerEmitter(): BroadcastEmitter {
  const instance = new Emitter(redisConnection) as unknown as BroadcastEmitter;
  emitter = instance;
  return instance;
}

export function getEmitter(): BroadcastEmitter {
  if (!emitter) throw new Error("Broadcast emitter not initialized yet");
  return emitter;
}
