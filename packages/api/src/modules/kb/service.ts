import { prisma } from "../../db/client.js";
import { slugify, withUniqueSuffix } from "../../lib/slug.js";
import { sanitizeArticleHtml, htmlToText } from "../../lib/sanitize.js";
import { ApiError } from "../../plugins/error-handler.js";
import type { KbArticleDTO, KbCategoryDTO } from "@tele/shared";
import type { KbArticle, KbCategory } from "@prisma/client";

function toCategoryDTO(cat: KbCategory): KbCategoryDTO {
  return { id: cat.id, name: cat.name, slug: cat.slug, order: cat.order };
}

function toArticleDTO(article: KbArticle & { category?: KbCategory }): KbArticleDTO {
  return {
    id: article.id,
    categoryId: article.categoryId,
    categoryName: article.category?.name,
    title: article.title,
    slug: article.slug,
    contentJson: article.contentJson,
    contentHtml: article.contentHtml,
    status: article.status,
    updatedAt: article.updatedAt.toISOString(),
  };
}

async function uniqueSlug(workspaceId: string, base: string, excludeId?: string): Promise<string> {
  let slug = slugify(base);
  for (let attempts = 0; attempts < 5; attempts++) {
    const clash = await prisma.kbArticle.findFirst({
      where: { workspaceId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (!clash) return slug;
    slug = withUniqueSuffix(slugify(base));
  }
  return slug;
}

async function refreshSearchVector(articleId: string, title: string, plainText: string) {
  await prisma.$executeRaw`
    UPDATE kb_articles
    SET "searchVector" = setweight(to_tsvector('english', coalesce(${title}, '')), 'A')
      || setweight(to_tsvector('english', coalesce(${plainText}, '')), 'B')
    WHERE id = ${articleId}
  `;
}

// --- Categories ---

export async function listCategories(workspaceId: string): Promise<KbCategoryDTO[]> {
  const categories = await prisma.kbCategory.findMany({ where: { workspaceId }, orderBy: { order: "asc" } });
  return categories.map(toCategoryDTO);
}

export async function createCategory(workspaceId: string, name: string): Promise<KbCategoryDTO> {
  const count = await prisma.kbCategory.count({ where: { workspaceId } });
  let slug = slugify(name);
  const clash = await prisma.kbCategory.findFirst({ where: { workspaceId, slug } });
  if (clash) slug = withUniqueSuffix(slug);
  const category = await prisma.kbCategory.create({ data: { workspaceId, name, slug, order: count } });
  return toCategoryDTO(category);
}

export async function updateCategory(
  workspaceId: string,
  categoryId: string,
  input: { name?: string; order?: number },
): Promise<KbCategoryDTO> {
  const existing = await prisma.kbCategory.findFirst({ where: { id: categoryId, workspaceId } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Category not found");
  const category = await prisma.kbCategory.update({ where: { id: categoryId }, data: input });
  return toCategoryDTO(category);
}

export async function deleteCategory(workspaceId: string, categoryId: string): Promise<void> {
  const existing = await prisma.kbCategory.findFirst({ where: { id: categoryId, workspaceId } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Category not found");
  const articleCount = await prisma.kbArticle.count({ where: { categoryId } });
  if (articleCount > 0) {
    throw new ApiError(400, "CATEGORY_NOT_EMPTY", "Move or delete articles in this category first");
  }
  await prisma.kbCategory.delete({ where: { id: categoryId } });
}

// --- Articles (admin) ---

export async function listArticlesAdmin(workspaceId: string): Promise<KbArticleDTO[]> {
  const articles = await prisma.kbArticle.findMany({
    where: { workspaceId },
    include: { category: true },
    orderBy: { updatedAt: "desc" },
  });
  return articles.map(toArticleDTO);
}

export async function getArticleAdmin(workspaceId: string, articleId: string): Promise<KbArticleDTO> {
  const article = await prisma.kbArticle.findFirst({ where: { id: articleId, workspaceId }, include: { category: true } });
  if (!article) throw new ApiError(404, "NOT_FOUND", "Article not found");
  return toArticleDTO(article);
}

export async function createArticle(
  workspaceId: string,
  input: { categoryId: string; title: string; contentJson?: unknown; contentHtml: string },
): Promise<KbArticleDTO> {
  const category = await prisma.kbCategory.findFirst({ where: { id: input.categoryId, workspaceId } });
  if (!category) throw new ApiError(400, "INVALID_CATEGORY", "Category not found");

  const cleanHtml = sanitizeArticleHtml(input.contentHtml);
  const slug = await uniqueSlug(workspaceId, input.title);
  const article = await prisma.kbArticle.create({
    data: {
      workspaceId,
      categoryId: input.categoryId,
      title: input.title,
      slug,
      contentJson: (input.contentJson as object) ?? {},
      contentHtml: cleanHtml,
      status: "DRAFT",
    },
    include: { category: true },
  });
  await refreshSearchVector(article.id, article.title, htmlToText(cleanHtml));
  return toArticleDTO(article);
}

export async function updateArticle(
  workspaceId: string,
  articleId: string,
  input: { categoryId?: string; title?: string; contentJson?: unknown; contentHtml?: string; status?: "DRAFT" | "PUBLISHED" },
): Promise<KbArticleDTO> {
  const existing = await prisma.kbArticle.findFirst({ where: { id: articleId, workspaceId } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Article not found");

  if (input.categoryId) {
    const category = await prisma.kbCategory.findFirst({ where: { id: input.categoryId, workspaceId } });
    if (!category) throw new ApiError(400, "INVALID_CATEGORY", "Category not found");
  }

  const cleanHtml = input.contentHtml !== undefined ? sanitizeArticleHtml(input.contentHtml) : undefined;
  const slug = input.title && input.title !== existing.title ? await uniqueSlug(workspaceId, input.title, articleId) : undefined;

  const article = await prisma.kbArticle.update({
    where: { id: articleId },
    data: {
      categoryId: input.categoryId,
      title: input.title,
      slug,
      contentJson: input.contentJson as object | undefined,
      contentHtml: cleanHtml,
      status: input.status,
    },
    include: { category: true },
  });

  if (cleanHtml !== undefined || input.title !== undefined) {
    await refreshSearchVector(article.id, article.title, htmlToText(article.contentHtml));
  }
  return toArticleDTO(article);
}

export async function deleteArticle(workspaceId: string, articleId: string): Promise<void> {
  const existing = await prisma.kbArticle.findFirst({ where: { id: articleId, workspaceId } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Article not found");
  await prisma.kbArticle.delete({ where: { id: articleId } });
}

// --- Public ---

export async function listPublicCategories(workspaceSlug: string) {
  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
  if (!workspace) throw new ApiError(404, "NOT_FOUND", "Workspace not found");

  const categories = await prisma.kbCategory.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { order: "asc" },
    include: { articles: { where: { status: "PUBLISHED" }, orderBy: { title: "asc" } } },
  });

  return {
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    categories: categories.map((cat) => ({
      ...toCategoryDTO(cat),
      articles: cat.articles.map(toArticleDTO),
    })),
  };
}

export async function getPublicArticle(workspaceSlug: string, articleSlug: string): Promise<KbArticleDTO> {
  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
  if (!workspace) throw new ApiError(404, "NOT_FOUND", "Workspace not found");
  const article = await prisma.kbArticle.findFirst({
    where: { workspaceId: workspace.id, slug: articleSlug, status: "PUBLISHED" },
    include: { category: true },
  });
  if (!article) throw new ApiError(404, "NOT_FOUND", "Article not found");
  return toArticleDTO(article);
}

export async function searchPublicArticles(workspaceSlug: string, query: string, limit: number): Promise<KbArticleDTO[]> {
  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
  if (!workspace) return [];

  // plainto_tsquery ANDs every remaining word together, which is too strict
  // for "suggest as you type" / natural-language questions (e.g. "how do I
  // GET a refund" won't match an article titled "how do I REQUEST a refund"
  // because "get" isn't in the document at all, and AND requires every term
  // to match). We still lean on plainto_tsquery to safely tokenize/stem/quote
  // arbitrary user input, then flip its AND ("&") operators to OR ("|") —
  // that string-replace is safe because it operates on Postgres's own output,
  // never on the raw user string, so there's no injection surface.
  const results = await prisma.$queryRaw<Array<KbArticle & { excerpt: string }>>`
    WITH q AS (
      SELECT replace(plainto_tsquery('english', ${query})::text, ' & ', ' | ')::tsquery AS tsq
    )
    SELECT a.id, a."categoryId", a.title, a.slug, a."contentHtml", a."contentJson", a.status, a."updatedAt", a."createdAt", a."workspaceId",
      ts_headline('english', a.title, q.tsq, 'MaxFragments=1,MaxWords=20') AS excerpt
    FROM kb_articles a, q
    WHERE a."workspaceId" = ${workspace.id}
      AND a.status = 'PUBLISHED'
      AND a."searchVector" @@ q.tsq
    ORDER BY ts_rank(a."searchVector", q.tsq) DESC
    LIMIT ${limit}
  `;

  if (results.length > 0) {
    return results.map((r) => ({ ...toArticleDTO(r), excerpt: r.excerpt }));
  }

  // Fallback for short/typo-prone queries where tsquery matches nothing (e.g.
  // single words shorter than a stemmed lexeme, or partial words while typing).
  const fallback = await prisma.kbArticle.findMany({
    where: {
      workspaceId: workspace.id,
      status: "PUBLISHED",
      OR: [{ title: { contains: query, mode: "insensitive" } }, { contentHtml: { contains: query, mode: "insensitive" } }],
    },
    take: limit,
  });
  return fallback.map(toArticleDTO);
}
