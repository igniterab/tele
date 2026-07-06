import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { ClientToServerEvents, ServerToClientEvents } from "@tele/shared";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { redisConnection } from "../queues/connection.js";
import { registerAgentNamespace } from "./agentNamespace.js";
import { registerWidgetNamespace } from "./widgetNamespace.js";
import { setBroadcastEmitter } from "./emitter.js";

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;

let io: IOServer | undefined;

export async function initRealtime(httpServer: HttpServer): Promise<IOServer> {
  io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
    // Public/embeddable widget also needs to reach us cross-origin without credentials.
  });

  const pubClient = redisConnection.duplicate();
  const subClient = redisConnection.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  registerAgentNamespace(io);
  registerWidgetNamespace(io);
  setBroadcastEmitter(io);

  logger.info({ webOrigin: env.WEB_ORIGIN }, "realtime layer initialized");
  return io;
}

export function getIO(): IOServer {
  if (!io) throw new Error("Realtime layer not initialized yet");
  return io;
}
