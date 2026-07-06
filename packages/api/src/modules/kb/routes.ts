import type { FastifyInstance } from "fastify";
import {
  createArticleSchema,
  createCategorySchema,
  kbSearchQuerySchema,
  updateArticleSchema,
  updateCategorySchema,
} from "@tele/shared";
import * as kb from "./service.js";

export default async function kbRoutes(fastify: FastifyInstance) {
  const preHandler = [fastify.authenticate, fastify.requireWorkspaceMember()];

  // --- Admin (dashboard) ---

  fastify.get("/api/workspaces/:workspaceId/kb/categories", { preHandler }, async (req, reply) => {
    reply.send({ categories: await kb.listCategories(req.workspace!.id) });
  });

  fastify.post("/api/workspaces/:workspaceId/kb/categories", { preHandler }, async (req, reply) => {
    const input = createCategorySchema.parse(req.body);
    reply.code(201).send({ category: await kb.createCategory(req.workspace!.id, input.name) });
  });

  fastify.patch("/api/workspaces/:workspaceId/kb/categories/:id", { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = updateCategorySchema.parse(req.body);
    reply.send({ category: await kb.updateCategory(req.workspace!.id, id, input) });
  });

  fastify.delete("/api/workspaces/:workspaceId/kb/categories/:id", { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await kb.deleteCategory(req.workspace!.id, id);
    reply.send({ ok: true });
  });

  fastify.get("/api/workspaces/:workspaceId/kb/articles", { preHandler }, async (req, reply) => {
    reply.send({ articles: await kb.listArticlesAdmin(req.workspace!.id) });
  });

  fastify.get("/api/workspaces/:workspaceId/kb/articles/:id", { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    reply.send({ article: await kb.getArticleAdmin(req.workspace!.id, id) });
  });

  fastify.post("/api/workspaces/:workspaceId/kb/articles", { preHandler }, async (req, reply) => {
    const input = createArticleSchema.parse(req.body);
    reply.code(201).send({ article: await kb.createArticle(req.workspace!.id, input) });
  });

  fastify.patch("/api/workspaces/:workspaceId/kb/articles/:id", { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = updateArticleSchema.parse(req.body);
    reply.send({ article: await kb.updateArticle(req.workspace!.id, id, input) });
  });

  fastify.delete("/api/workspaces/:workspaceId/kb/articles/:id", { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await kb.deleteArticle(req.workspace!.id, id);
    reply.send({ ok: true });
  });

  // --- Public (KB page + widget suggestions) ---

  fastify.get(
    "/api/public/kb/:workspaceSlug/categories",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { workspaceSlug } = req.params as { workspaceSlug: string };
      reply.send(await kb.listPublicCategories(workspaceSlug));
    },
  );

  fastify.get(
    "/api/public/kb/:workspaceSlug/articles/:articleSlug",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { workspaceSlug, articleSlug } = req.params as { workspaceSlug: string; articleSlug: string };
      reply.send({ article: await kb.getPublicArticle(workspaceSlug, articleSlug) });
    },
  );

  fastify.get(
    "/api/public/kb/:workspaceSlug/search",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { workspaceSlug } = req.params as { workspaceSlug: string };
      const query = kbSearchQuerySchema.parse(req.query);
      reply.send({ articles: await kb.searchPublicArticles(workspaceSlug, query.q, query.limit) });
    },
  );
}
