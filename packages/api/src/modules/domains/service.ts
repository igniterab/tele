import { prisma } from "../../db/client.js";
import { env } from "../../env.js";
import { logger } from "../../logger.js";
import { randomToken } from "../../lib/tokens.js";
import { ApiError } from "../../plugins/error-handler.js";
import { txtRecordName, verifyCnameRecord, verifyTxtRecord } from "./dns.js";
import { provisionSsl } from "./ssl.js";
import type { Domain } from "@prisma/client";
import type { DomainDTO } from "@tele/shared";

function toDomainDTO(domain: Domain): DomainDTO {
  return {
    id: domain.id,
    hostname: domain.hostname,
    status: domain.status,
    verificationToken: domain.verificationToken,
    verifiedAt: domain.verifiedAt?.toISOString() ?? null,
    lastCheckedAt: domain.lastCheckedAt?.toISOString() ?? null,
    createdAt: domain.createdAt.toISOString(),
    instructions: {
      txtRecordName: txtRecordName(domain.hostname),
      txtRecordValue: domain.verificationToken,
      cnameTarget: env.KB_CNAME_TARGET,
    },
  };
}

export async function listDomains(workspaceId: string): Promise<DomainDTO[]> {
  const domains = await prisma.domain.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  return domains.map(toDomainDTO);
}

export async function addDomain(workspaceId: string, hostname: string): Promise<DomainDTO> {
  const existing = await prisma.domain.findUnique({ where: { hostname } });
  if (existing) throw new ApiError(409, "DOMAIN_TAKEN", "This domain is already connected to a workspace");

  const domain = await prisma.domain.create({
    data: { workspaceId, hostname, verificationToken: randomToken(16), status: "PENDING" },
  });
  return toDomainDTO(domain);
}

export async function deleteDomain(workspaceId: string, domainId: string): Promise<void> {
  const domain = await prisma.domain.findFirst({ where: { id: domainId, workspaceId } });
  if (!domain) throw new ApiError(404, "NOT_FOUND", "Domain not found");
  await prisma.domain.delete({ where: { id: domainId } });
}

/**
 * Advances a domain at most one step per call — PENDING → VERIFIED → SSL_PROVISIONING
 * → ACTIVE — so the state machine progresses visibly across successive
 * repeatable-job ticks rather than jumping straight to ACTIVE in one call.
 */
export async function checkAndAdvanceDomain(domainId: string): Promise<void> {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain || domain.status === "ACTIVE" || domain.status === "FAILED") return;

  const now = new Date();

  if (domain.status === "PENDING") {
    const verified = env.DOMAIN_VERIFICATION_DEV_BYPASS
      ? true
      : (await verifyTxtRecord(domain.hostname, domain.verificationToken)) &&
        (await verifyCnameRecord(domain.hostname, env.KB_CNAME_TARGET));

    await prisma.domain.update({
      where: { id: domainId },
      data: { lastCheckedAt: now, ...(verified ? { status: "VERIFIED", verifiedAt: now } : {}) },
    });
    return;
  }

  if (domain.status === "VERIFIED") {
    const result = await provisionSsl(domain.hostname);
    await prisma.domain.update({
      where: { id: domainId },
      data: { lastCheckedAt: now, status: result.ok ? "SSL_PROVISIONING" : "FAILED" },
    });
    return;
  }

  if (domain.status === "SSL_PROVISIONING") {
    await prisma.domain.update({ where: { id: domainId }, data: { lastCheckedAt: now, status: "ACTIVE" } });
  }
}

export async function checkAllPendingDomains(): Promise<void> {
  const domains = await prisma.domain.findMany({ where: { status: { notIn: ["ACTIVE", "FAILED"] } } });
  for (const d of domains) {
    await checkAndAdvanceDomain(d.id).catch((err) => logger.warn({ err, domainId: d.id }, "domain verification tick failed"));
  }
}
