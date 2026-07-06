import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@tele/shared";

type WidgetSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: WidgetSocket | null = null;
let socketToken: string | null = null;

export function getWidgetSocket(token: string): WidgetSocket {
  // Reuse the existing connection when the token is unchanged. Recreating it on
  // every call (e.g. per keystroke / send) would tear down the socket that has
  // the message/typing listeners attached, so live updates would silently stop
  // until the next page load.
  if (socket && socketToken === token) return socket;
  if (socket) socket.disconnect();
  socket = io("/widget", {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  socketToken = token;
  return socket;
}
