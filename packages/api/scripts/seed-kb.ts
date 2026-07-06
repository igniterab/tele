/**
 * Populates the Acme Support knowledge base with a realistic set of categories
 * and published articles (Orders, Shipping, Returns & Refunds, Billing, Account,
 * Getting Started). Also cleans up empty/leftover categories. Idempotent —
 * reuses categories/articles by name/title, safe to re-run.
 *
 * Usage:  npx tsx scripts/seed-kb.ts
 */
import { prisma } from "../src/db/client.js";
import { logger } from "../src/logger.js";
import { createCategory, createArticle, updateArticle } from "../src/modules/kb/service.js";

const WORKSPACE_SLUG = "acme-support";

// --- Tiny block model → renders matching Tiptap JSON (for the admin editor)
//     and HTML (for the public page) so the two never drift. ---
type Block =
  | { h: string }
  | { p: string }
  | { ul: string[] }
  | { ol: string[] };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toHtml(blocks: Block[]): string {
  return blocks
    .map((b) => {
      if ("h" in b) return `<h3>${esc(b.h)}</h3>`;
      if ("p" in b) return `<p>${esc(b.p)}</p>`;
      if ("ul" in b) return `<ul>${b.ul.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
      return `<ol>${b.ol.map((i) => `<li>${esc(i)}</li>`).join("")}</ol>`;
    })
    .join("");
}

function toJson(blocks: Block[]): object {
  const listItems = (items: string[]) =>
    items.map((t) => ({
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
    }));
  const content = blocks.map((b) => {
    if ("h" in b) return { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: b.h }] };
    if ("p" in b) return { type: "paragraph", content: [{ type: "text", text: b.p }] };
    if ("ul" in b) return { type: "bulletList", content: listItems(b.ul) };
    return { type: "orderedList", content: listItems(b.ol) };
  });
  return { type: "doc", content };
}

interface ArticleSpec {
  title: string;
  blocks: Block[];
}
interface CategorySpec {
  name: string;
  articles: ArticleSpec[];
}

const CATEGORIES: CategorySpec[] = [
  {
    name: "Getting Started",
    articles: [
      {
        title: "Welcome to Acme Support",
        blocks: [
          { p: "Welcome! This help center answers the most common questions about orders, shipping, billing, and your account." },
          { p: "Can't find what you need? Start a chat with us from the widget in the bottom-right corner and a support agent will help." },
        ],
      },
      {
        title: "How do I contact the support team?",
        blocks: [
          { p: "There are two ways to reach us:" },
          { ul: ["Live chat — click the chat bubble on any page for a real-time reply.", "Email — write to support@acme-support and we'll respond, keeping everything in one thread."] },
          { p: "Our team is typically online during business hours and will reply to email within one business day." },
        ],
      },
    ],
  },
  {
    name: "Orders",
    articles: [
      {
        title: "How do I place an order?",
        blocks: [
          { p: "Placing an order takes just a few steps:" },
          { ol: ["Add the items you want to your cart.", "Click the cart icon and review your items and quantities.", "Enter your shipping address and payment details at checkout.", "Confirm the order — you'll get a confirmation email with your order number."] },
          { p: "Keep your order number handy; you'll need it to track the order or contact support about it." },
        ],
      },
      {
        title: "How do I track my order?",
        blocks: [
          { h: "Finding your tracking information" },
          { p: "Once your order ships, we email you a tracking link. You can also find it under Account → Orders → the specific order." },
          { p: "Tracking can take up to 24 hours to show movement after you receive the email — that's normal while the carrier scans the package in." },
        ],
      },
      {
        title: "Can I change or cancel my order?",
        blocks: [
          { p: "We can usually change or cancel an order while it's still being prepared." },
          { ul: ["Before it ships — contact us right away and we'll update the address, items, or cancel it.", "After it ships — it can't be cancelled, but you can return it once it arrives (see Returns & Refunds)."] },
          { p: "The fastest way to reach us for a time-sensitive change is live chat." },
        ],
      },
    ],
  },
  {
    name: "Shipping & Delivery",
    articles: [
      {
        title: "How long does shipping take?",
        blocks: [
          { p: "Delivery time depends on the shipping method chosen at checkout:" },
          { ul: ["Standard — 3 to 5 business days.", "Express — 1 to 2 business days.", "International — 7 to 14 business days, depending on customs."] },
          { p: "Orders placed after 2pm are processed the next business day." },
        ],
      },
      {
        title: "Do you ship internationally?",
        blocks: [
          { p: "Yes — we ship to most countries. International shipping cost and delivery estimates are shown at checkout once you enter your address." },
          { p: "Any import duties or taxes charged by your country's customs are the recipient's responsibility and are not included in the order total." },
        ],
      },
      {
        title: "My order hasn't arrived — what should I do?",
        blocks: [
          { p: "If your tracking shows delivered but you don't have the package, or it's past the estimated delivery window:" },
          { ol: ["Check around your delivery location and with neighbors or building reception.", "Confirm the shipping address on your order is correct.", "Contact us with your order number and we'll open an investigation with the carrier."] },
        ],
      },
    ],
  },
  {
    name: "Returns & Refunds",
    articles: [
      {
        title: "How do I return an item?",
        blocks: [
          { p: "You can return most items within 30 days of delivery." },
          { ol: ["Go to Account → Orders and select the order.", "Choose the item(s) you want to return and the reason.", "Print the prepaid return label we email you.", "Drop the package at any carrier location."] },
          { p: "Items should be unused and in their original packaging where possible." },
        ],
      },
      {
        title: "When will I get my refund?",
        blocks: [
          { p: "Once we receive and inspect your return, we issue the refund to your original payment method." },
          { p: "Refunds typically appear within 5 to 10 business days, depending on your bank or card provider. We'll email you when the refund is on its way." },
        ],
      },
    ],
  },
  {
    name: "Billing",
    articles: [
      {
        title: "What payment methods do you accept?",
        blocks: [
          { p: "We accept the following payment methods:" },
          { ul: ["Major credit and debit cards (Visa, Mastercard, American Express).", "Apple Pay and Google Pay.", "PayPal."] },
          { p: "Your payment details are processed securely and are never stored on our servers." },
        ],
      },
      {
        title: "Why was I charged twice?",
        blocks: [
          { p: "A duplicate charge is almost always a temporary authorization hold, not a real second charge." },
          { p: "When a payment doesn't go through on the first try, your bank may show a pending authorization that drops off within a few business days. If a genuine duplicate charge settles, contact us with your order number and we'll refund it." },
        ],
      },
    ],
  },
  {
    name: "Account & Security",
    articles: [
      {
        title: "How do I reset my password?",
        blocks: [
          { p: "To reset your password:" },
          { ol: ["Click 'Forgot password?' on the login screen.", "Enter the email address on your account.", "Open the reset link we email you and choose a new password."] },
          { p: "If the email doesn't arrive within a few minutes, check your spam folder or make sure you used the right address." },
        ],
      },
      {
        title: "How do I update my email or contact details?",
        blocks: [
          { p: "Go to Account → Settings to update your email address, name, and notification preferences." },
          { p: "If you change your email, we'll send a confirmation link to the new address to verify it before the change takes effect." },
        ],
      },
      {
        title: "Is my payment information secure?",
        blocks: [
          { p: "Yes. Payments are handled by a PCI-compliant payment processor, and card details are transmitted over an encrypted connection." },
          { p: "We never see or store your full card number — only a token we use to process approved charges." },
        ],
      },
    ],
  },
];

async function main() {
  const workspace = await prisma.workspace.findUnique({ where: { slug: WORKSPACE_SLUG } });
  if (!workspace) throw new Error(`Workspace "${WORKSPACE_SLUG}" not found — run the seed first.`);
  const wsId = workspace.id;

  // 1. Remove empty/leftover categories (duplicate "Billing" placeholders, test rows).
  const empties = await prisma.kbCategory.findMany({
    where: { workspaceId: wsId, articles: { none: {} } },
    select: { id: true, name: true, slug: true },
  });
  if (empties.length) {
    await prisma.kbCategory.deleteMany({ where: { id: { in: empties.map((c) => c.id) } } });
    logger.info({ removed: empties.map((c) => c.slug) }, "removed empty categories");
  }

  // 2. Upsert categories + published articles (idempotent by name/title).
  let createdCats = 0;
  let createdArticles = 0;
  for (const [index, cat] of CATEGORIES.entries()) {
    let category = await prisma.kbCategory.findFirst({ where: { workspaceId: wsId, name: cat.name } });
    if (!category) {
      const dto = await createCategory(wsId, cat.name);
      category = await prisma.kbCategory.findUniqueOrThrow({ where: { id: dto.id } });
      createdCats++;
    }
    // Enforce the display order defined by CATEGORIES (Getting Started first),
    // overriding the creation-time order (e.g. Billing from the base seed).
    await prisma.kbCategory.update({ where: { id: category.id }, data: { order: index } });

    for (const art of cat.articles) {
      const exists = await prisma.kbArticle.findFirst({ where: { workspaceId: wsId, title: art.title } });
      if (exists) continue;
      const created = await createArticle(wsId, {
        categoryId: category.id,
        title: art.title,
        contentJson: toJson(art.blocks),
        contentHtml: toHtml(art.blocks),
      });
      await updateArticle(wsId, created.id, { status: "PUBLISHED" });
      createdArticles++;
    }
  }

  const totals = await prisma.kbCategory.count({ where: { workspaceId: wsId } });
  const articleTotal = await prisma.kbArticle.count({ where: { workspaceId: wsId } });
  logger.info(
    { createdCategories: createdCats, createdArticles, totalCategories: totals, totalArticles: articleTotal },
    "seed-kb complete",
  );
}

main()
  .catch((err) => {
    logger.error({ err }, "seed-kb failed");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
