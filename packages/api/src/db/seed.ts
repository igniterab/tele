/**
 * Seeds a demo workspace so a fresh `docker-compose up` has something to look
 * at immediately: an admin + agent account, a couple of chat/email
 * conversations, and a published KB article. Safe to re-run — it upserts by
 * unique keys rather than blindly inserting.
 */
import { prisma } from "./client.js";
import { hashPassword } from "../lib/password.js";
import { logger } from "../logger.js";

const DEMO_PASSWORD = "password123";

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { slug: "acme-support" },
    update: {},
    create: { name: "Acme Support", slug: "acme-support" },
  });

  const adminPasswordHash = await hashPassword(DEMO_PASSWORD);
  const admin = await prisma.user.upsert({
    where: { email: "ada@example.com" },
    update: {},
    create: { name: "Ada Admin", email: "ada@example.com", passwordHash: adminPasswordHash },
  });
  await prisma.membership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: admin.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: admin.id, role: "ADMIN", status: "ACTIVE" },
  });

  const agentPasswordHash = await hashPassword(DEMO_PASSWORD);
  const agent = await prisma.user.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: { name: "Bob Agent", email: "bob@example.com", passwordHash: agentPasswordHash },
  });
  await prisma.membership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: agent.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: agent.id, role: "AGENT", status: "ACTIVE" },
  });

  const contact = await prisma.contact.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      workspaceId: workspace.id,
      name: "Visitor",
      email: null,
    },
  });

  const existingConvo = await prisma.conversation.findFirst({
    where: { workspaceId: workspace.id, contactId: contact.id, channel: "CHAT" },
  });
  const conversation =
    existingConvo ??
    (await prisma.conversation.create({
      data: { workspaceId: workspace.id, contactId: contact.id, channel: "CHAT", status: "OPEN" },
    }));

  const messageCount = await prisma.message.count({ where: { conversationId: conversation.id } });
  if (messageCount === 0) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        workspaceId: workspace.id,
        senderType: "CONTACT",
        bodyHtml: "<p>Hi, I can't find the invoice for my last order.</p>",
        bodyText: "Hi, I can't find the invoice for my last order.",
        channel: "CHAT",
      },
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
  }

  const category = await prisma.kbCategory.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: "billing" } },
    update: {},
    create: { workspaceId: workspace.id, name: "Billing", slug: "billing", order: 0 },
  });

  const articleHtml = "<p>You can find all past invoices under Account &rarr; Billing &rarr; Invoice history.</p>";
  await prisma.kbArticle.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: "where-do-i-find-my-invoices" } },
    update: {},
    create: {
      workspaceId: workspace.id,
      categoryId: category.id,
      title: "Where do I find my invoices?",
      slug: "where-do-i-find-my-invoices",
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "You can find all past invoices under Account → Billing → Invoice history." }] }],
      },
      contentHtml: articleHtml,
      status: "PUBLISHED",
    },
  });
  await prisma.$executeRaw`
    UPDATE kb_articles
    SET "searchVector" = setweight(to_tsvector('english', 'Where do I find my invoices?'), 'A')
      || setweight(to_tsvector('english', 'You can find all past invoices under Account Billing Invoice history.'), 'B')
    WHERE "workspaceId" = ${workspace.id} AND slug = 'where-do-i-find-my-invoices'
  `;

  logger.info(
    { workspace: workspace.slug, admin: admin.email, agent: agent.email, password: DEMO_PASSWORD },
    "seed complete",
  );
}

main()
  .catch((err) => {
    logger.error({ err }, "seed failed");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
