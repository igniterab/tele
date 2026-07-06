import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@tele/shared";

type WidgetSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: WidgetSocket | null = null;

export function getWidgetSocket(token: string): WidgetSocket {
  if (socket) socket.disconnect();
  socket = io("/widget", {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  return socket;
}
