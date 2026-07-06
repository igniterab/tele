import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@tele/shared";
import { verifyVisitorToken } from "../lib/jwt.js";
import { logger } from "../logger.js";
import { workspaceRoom, conversationRoom } from "./rooms.js";
import { addVisitorSocket, removeVisitorSocket, isAgentOnline } from "./presence.js";
import { markConversationRead } from "../modules/messages/service.js";
import { getEmitter } from "./emitter.js";
import { prisma } from "../db/client.js";

interface WidgetSocketData {
  contactId: string;
  workspaceId: string;
}

type WidgetServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, WidgetSocketData>;

export function registerWidgetNamespace(io: Server) {
  const nsp = io.of("/widget") as unknown as WidgetServer;

  nsp.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("Unauthorized"));
      const payload = verifyVisitorToken(token);
      socket.data.contactId = payload.sub;
      socket.data.workspaceId = payload.workspaceId;
      next();
    } catch (err) {
      logger.warn({ err }, "widget socket auth failed");
      next(new Error("Unauthorized"));
    }
  });

  nsp.on("connection", (socket: Socket) => {
    const { contactId, workspaceId } = socket.data as WidgetSocketData;
    addVisitorSocket(contactId, socket.id);

    // Tell the visitor immediately whether any agent is currently online.
    socket.emit("presence:update", { agentIds: isAgentOnline(workspaceId) ? ["*"] : [] });

    void (async () => {
      const openConvo = await prisma.conversation.findFirst({
        where: { workspaceId, contactId, channel: "CHAT", status: { not: "RESOLVED" } },
        orderBy: { lastMessageAt: "desc" },
      });
      if (openConvo) {
        socket.join(conversationRoom(openConvo.id));
        socket
          .to(workspaceRoom(workspaceId))
          .emit("presence:update", { conversationId: openConvo.id, contactOnline: true });
      }
    })();

    socket.on("conversation:join", (conversationId: string) => {
      socket.join(conversationRoom(conversationId));
    });

    socket.on("typing:start", ({ conversationId }) => {
      const payload = { conversationId, senderType: "CONTACT" as const, senderName: "Visitor" };
      // Other tabs of the same visitor (same namespace, exclude sender)...
      socket.to(conversationRoom(conversationId)).emit("typing:start", payload);
      // ...and the agent, who lives in the /agent namespace (cross-namespace).
      getEmitter().of("/agent").to(conversationRoom(conversationId)).emit("typing:start", payload);
    });

    socket.on("typing:stop", ({ conversationId }) => {
      const payload = { conversationId, senderType: "CONTACT" as const, senderName: "Visitor" };
      socket.to(conversationRoom(conversationId)).emit("typing:stop", payload);
      getEmitter().of("/agent").to(conversationRoom(conversationId)).emit("typing:stop", payload);
    });

    socket.on("message:read", async ({ conversationId }) => {
      try {
        await markConversationRead(workspaceId, conversationId, "CONTACT");
      } catch (err) {
        logger.warn({ err, conversationId }, "visitor read receipt failed");
      }
    });

    socket.on("disconnect", () => {
      const remaining = removeVisitorSocket(contactId, socket.id);
      socket.to(workspaceRoom(workspaceId)).emit("presence:update", { contactOnline: remaining > 0 });
    });
  });
}
