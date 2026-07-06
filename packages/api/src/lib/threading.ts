import { randomUUID } from "node:crypto";
import { env } from "../env.js";

export function generateMessageId(workspaceSlug: string): string {
  return `<${randomUUID()}@${workspaceSlug}.${env.EMAIL_DOMAIN}>`;
}

/**
 * RFC 5322 References header: parent's References chain + parent's Message-ID,
 * space separated, oldest-first. This is what lets mail clients (and our own
 * inbound matcher) reconstruct the full thread even if In-Reply-To alone is lost.
 */
export function buildReferences(parentReferences: string | null, parentMessageId: string | null): string | null {
  if (!parentMessageId) return parentReferences;
  const prior = parentReferences ? parentReferences.trim().split(/\s+/) : [];
  return [...prior, parentMessageId].join(" ");
}

export function extractMessageIds(headerValue: string | null | undefined): string[] {
  if (!headerValue) return [];
  return headerValue.match(/<[^<>]+>/g) ?? [];
}
