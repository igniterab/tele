import { logger } from "../../logger.js";

/**
 * STUBBED. See docs/CUSTOM_DOMAINS.md for the full explanation and the two
 * realistic production approaches (Caddy/Traefik on-demand TLS via ACME, or
 * Cloudflare for SaaS custom hostnames). This build has no public-facing box
 * or DNS zone to actually issue a certificate against, so this function
 * simulates the *shape* of that call (async, can fail, takes real time) without
 * doing anything — it's the seam where a real ACME client or Cloudflare API
 * call would go, so the rest of the state machine (VERIFIED → SSL_PROVISIONING
 * → ACTIVE) is exercised faithfully even though no certificate is ever issued.
 */
export async function provisionSsl(hostname: string): Promise<{ ok: true } | { ok: false; error: string }> {
  logger.info({ hostname }, "[stub] would request/renew a TLS certificate for this hostname here");
  return { ok: true };
}
