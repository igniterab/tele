import { z } from "zod";
import { ArticleStatus } from "../enums.js";

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial().extend({
  order: z.number().int().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createArticleSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  contentJson: z.unknown(),
  contentHtml: z.string().max(200_000),
});
export type CreateArticleInput = z.infer<typeof createArticleSchema>;

export const updateArticleSchema = z.object({
  categoryId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  contentJson: z.unknown().optional(),
  contentHtml: z.string().max(200_000).optional(),
  status: z.enum([ArticleStatus.DRAFT, ArticleStatus.PUBLISHED]).optional(),
});
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;

export const kbSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
export type KbSearchQuery = z.infer<typeof kbSearchQuerySchema>;
