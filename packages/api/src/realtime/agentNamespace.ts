import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@tele/shared";
import cookie from "cookie";
import { verifySessionToken } from "../lib/jwt.js";
import { prisma } from "../db/client.js";
import { logger } from "../logger.js";
import { SESSION_COOKIE } from "../plugins/auth.js";
import { workspaceRoom, conversationRoom } from "./rooms.js";
import { addAgentSocket, removeAgentSocket, onlineAgentIds } from "./presence.js";
import { markConversationRead } from "../modules/messages/service.js";

interface AgentSocketData {
  userId: string;
  userName: string;
  workspaceId: string;
}

type AgentServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, AgentSocketData>;

export function registerAgentNamespace(io: Server) {
  const nsp = io.of("/agent") as unknown as AgentServer;

  nsp.use(async (socket, next) => {
    try {
      const rawCookies = socket.handshake.headers.cookie;
      const workspaceId = socket.handshake.auth?.workspaceId as string | undefined;
      if (!rawCookies || !workspaceId) return next(new Error("Unauthorized"));

      const parsed = cookie.parse(rawCookies);
      const token = parsed[SESSION_COOKIE];
      if (!token) return next(new Error("Unauthorized"));

      const payload = verifySessionToken(token);
      const membership = await prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: payload.sub } },
        include: { user: true },
      });
      if (!membership || membership.status !== "ACTIVE") return next(new Error("Forbidden"));

      socket.data.userId = membership.userId;
      socket.data.userName = membership.user.name;
      socket.data.workspaceId = workspaceId;
      next();
    } catch (err) {
      logger.warn({ err }, "agent socket auth failed");
      next(new Error("Unauthorized"));
    }
  });

  nsp.on("connection", (socket: Socket) => {
    const { workspaceId, userId, userName } = socket.data as AgentSocketData;
    socket.join(workspaceRoom(workspaceId));
    const agentIds = addAgentSocket(workspaceId, userId);
    nsp.to(workspaceRoom(workspaceId)).emit("presence:update", { agentIds });

    socket.on("conversation:join", (conversationId: string) => {
      socket.join(conversationRoom(conversationId));
    });

    socket.on("conversation:leave", (conversationId: string) => {
      socket.leave(conversationRoom(conversationId));
    });

    socket.on("typing:start", ({ conversationId }) => {
      socket.to(conversationRoom(conversationId)).emit("typing:start", {
        conversationId,
        senderType: "AGENT",
        senderName: userName,
      });
    });

    socket.on("typing:stop", ({ conversationId }) => {
      socket.to(conversationRoom(conversationId)).emit("typing:stop", {
        conversationId,
        senderType: "AGENT",
        senderName: userName,
      });
    });

    socket.on("message:read", async ({ conversationId }) => {
      try {
        await markConversationRead(workspaceId, conversationId, "AGENT");
      } catch (err) {
        logger.warn({ err, conversationId }, "agent read receipt failed");
      }
    });

    socket.on("disconnect", () => {
      const remaining = removeAgentSocket(workspaceId, userId);
      nsp.to(workspaceRoom(workspaceId)).emit("presence:update", { agentIds: remaining.length ? remaining : onlineAgentIds(workspaceId) });
    });
  });
}
