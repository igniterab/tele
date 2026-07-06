import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@tele/shared";

type AgentSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AgentSocket | null = null;
let socketWorkspaceId: string | null = null;

export function getAgentSocket(workspaceId: string): AgentSocket {
  if (socket && socketWorkspaceId === workspaceId) return socket;
  if (socket) socket.disconnect();

  socket = io("/agent", {
    withCredentials: true,
    auth: { workspaceId },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  socketWorkspaceId = workspaceId;
  return socket;
}
