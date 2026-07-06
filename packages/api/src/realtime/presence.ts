/**
 * In-memory presence tracking, scoped to this process. Fine for the single API
 * node this runs on locally. At real multi-node scale, socket connections land on
 * different processes, so this would move to Redis (e.g. a SET per workspace with
 * per-socket TTL heartbeats, incremented/decremented via the same pub/sub already
 * wired up for the Socket.IO Redis adapter) instead of process memory.
 */

// workspaceId -> (userId -> connected socket count, for multi-tab support)
const agentsByWorkspace = new Map<string, Map<string, number>>();
const visitorSocketsByContact = new Map<string, Set<string>>();

export function addAgentSocket(workspaceId: string, userId: string): string[] {
  const users = agentsByWorkspace.get(workspaceId) ?? new Map<string, number>();
  users.set(userId, (users.get(userId) ?? 0) + 1);
  agentsByWorkspace.set(workspaceId, users);
  return [...users.keys()];
}

export function removeAgentSocket(workspaceId: string, userId: string): string[] {
  const users = agentsByWorkspace.get(workspaceId);
  if (!users) return [];
  const next = (users.get(userId) ?? 1) - 1;
  if (next <= 0) users.delete(userId);
  else users.set(userId, next);
  if (users.size === 0) agentsByWorkspace.delete(workspaceId);
  return [...users.keys()];
}

export function onlineAgentIds(workspaceId: string): string[] {
  return [...(agentsByWorkspace.get(workspaceId)?.keys() ?? [])];
}

export function isAgentOnline(workspaceId: string): boolean {
  return (agentsByWorkspace.get(workspaceId)?.size ?? 0) > 0;
}

export function addVisitorSocket(contactId: string, socketId: string): number {
  const set = visitorSocketsByContact.get(contactId) ?? new Set();
  set.add(socketId);
  visitorSocketsByContact.set(contactId, set);
  return set.size;
}

export function removeVisitorSocket(contactId: string, socketId: string): number {
  const set = visitorSocketsByContact.get(contactId);
  if (!set) return 0;
  set.delete(socketId);
  if (set.size === 0) visitorSocketsByContact.delete(contactId);
  return set?.size ?? 0;
}

export function isContactOnline(contactId: string): boolean {
  return (visitorSocketsByContact.get(contactId)?.size ?? 0) > 0;
}
