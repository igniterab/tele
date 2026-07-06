import dns from "node:dns/promises";

export function txtRecordName(hostname: string): string {
  return `_tele-verify.${hostname}`;
}

/** Real DNS lookups — no mocking. Returns false (not throws) for any resolution failure (NXDOMAIN, timeout, etc.), since "not yet verified" is the expected steady state while a customer is still editing their DNS. */
export async function verifyTxtRecord(hostname: string, expectedToken: string): Promise<boolean> {
  try {
    const records = await dns.resolveTxt(txtRecordName(hostname));
    return records.some((chunks) => chunks.join("").trim() === expectedToken);
  } catch {
    return false;
  }
}

export async function verifyCnameRecord(hostname: string, expectedTarget: string): Promise<boolean> {
  try {
    const records = await dns.resolveCname(hostname);
    return records.some((target) => target.replace(/\.$/, "") === expectedTarget.replace(/\.$/, ""));
  } catch {
    return false;
  }
}
