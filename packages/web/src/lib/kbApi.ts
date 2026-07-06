import { api } from "./api";
import type { KbArticleDTO, KbCategoryDTO } from "@tele/shared";

export const kbApi = {
  listCategories: (workspaceId: string) =>
    api.get<{ categories: KbCategoryDTO[] }>(`/api/workspaces/${workspaceId}/kb/categories`).then((r) => r.categories),

  createCategory: (workspaceId: string, name: string) =>
    api
      .post<{ category: KbCategoryDTO }>(`/api/workspaces/${workspaceId}/kb/categories`, { name })
      .then((r) => r.category),

  deleteCategory: (workspaceId: string, categoryId: string) =>
    api.delete(`/api/workspaces/${workspaceId}/kb/categories/${categoryId}`),

  listArticles: (workspaceId: string) =>
    api.get<{ articles: KbArticleDTO[] }>(`/api/workspaces/${workspaceId}/kb/articles`).then((r) => r.articles),

  getArticle: (workspaceId: string, articleId: string) =>
    api.get<{ article: KbArticleDTO }>(`/api/workspaces/${workspaceId}/kb/articles/${articleId}`).then((r) => r.article),

  createArticle: (workspaceId: string, input: { categoryId: string; title: string; contentJson: unknown; contentHtml: string }) =>
    api.post<{ article: KbArticleDTO }>(`/api/workspaces/${workspaceId}/kb/articles`, input).then((r) => r.article),

  updateArticle: (
    workspaceId: string,
    articleId: string,
    input: Partial<{ categoryId: string; title: string; contentJson: unknown; contentHtml: string; status: "DRAFT" | "PUBLISHED" }>,
  ) => api.patch<{ article: KbArticleDTO }>(`/api/workspaces/${workspaceId}/kb/articles/${articleId}`, input).then((r) => r.article),

  deleteArticle: (workspaceId: string, articleId: string) =>
    api.delete(`/api/workspaces/${workspaceId}/kb/articles/${articleId}`),
};
