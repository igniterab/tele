/**
 * Adds a few extra agent accounts to the Acme Support workspace so you can log
 * in as different people across normal + incognito windows and exercise
 * assignment, presence, and multi-agent real-time updates. Idempotent — upserts
 * by email, safe to re-run.
 *
 * Usage:  npx tsx scripts/add-users.ts
 */
import { prisma } from "../src/db/client.js";
import { hashPassword } from "../src/lib/password.js";
import { logger } from "../src/logger.js";

const PASSWORD = "password123";
const WORKSPACE_SLUG = "acme-support";

const EXTRA_USERS: Array<{ name: string; email: string; role: "ADMIN" | "AGENT" }> = [
  { name: "Carol Agent", email: "carol@example.com", role: "AGENT" },
  { name: "Dave Agent", email: "dave@example.com", role: "AGENT" },
  { name: "Erin Admin", email: "erin@example.com", role: "ADMIN" },
];

async function main() {
  const workspace = await prisma.workspace.findUnique({ where: { slug: WORKSPACE_SLUG } });
  if (!workspace) throw new Error(`Workspace "${WORKSPACE_SLUG}" not found — run the seed first.`);

  const passwordHash = await hashPassword(PASSWORD);

  for (const u of EXTRA_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, passwordHash },
    });
    await prisma.membership.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      update: { role: u.role, status: "ACTIVE" },
      create: { workspaceId: workspace.id, userId: user.id, role: u.role, status: "ACTIVE" },
    });
    logger.info({ email: u.email, role: u.role }, "user ready");
  }

  logger.info({ count: EXTRA_USERS.length, workspace: WORKSPACE_SLUG, password: PASSWORD }, "add-users complete");
}

main()
  .catch((err) => {
    logger.error({ err }, "add-users failed");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
