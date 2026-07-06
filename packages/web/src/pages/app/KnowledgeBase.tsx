import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace";
import { kbApi } from "../../lib/kbApi";
import RichTextEditor from "./components/RichTextEditor";

export default function KnowledgeBase() {
  const { workspaceId } = useWorkspace();
  const { articleId } = useParams<{ articleId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const categoriesQuery = useQuery({
    queryKey: ["kb-categories", workspaceId],
    queryFn: () => kbApi.listCategories(workspaceId),
  });
  const articlesQuery = useQuery({
    queryKey: ["kb-articles", workspaceId],
    queryFn: () => kbApi.listArticles(workspaceId),
  });

  async function addCategory() {
    const name = window.prompt("Category name");
    if (!name?.trim()) return;
    await kbApi.createCategory(workspaceId, name.trim());
    queryClient.invalidateQueries({ queryKey: ["kb-categories", workspaceId] });
  }

  async function addArticle() {
    const categories = categoriesQuery.data ?? [];
    if (categories.length === 0) {
      alert("Create a category first");
      return;
    }
    const article = await kbApi.createArticle(workspaceId, {
      categoryId: categories[0].id,
      title: "Untitled article",
      contentJson: { type: "doc", content: [{ type: "paragraph" }] },
      contentHtml: "",
    });
    queryClient.invalidateQueries({ queryKey: ["kb-articles", workspaceId] });
    navigate(`/app/knowledge-base/${article.id}`);
  }

  const categories = categoriesQuery.data ?? [];
  const articles = articlesQuery.data ?? [];

  return (
    <div className="flex h-full">
      <div className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Categories</h2>
          <button onClick={addCategory} className="text-xs text-brand-600 hover:underline">
            + New
          </button>
        </div>
        <div className="mt-2 space-y-3">
          {categories.map((cat) => (
            <div key={cat.id}>
              <div className="text-xs font-medium text-slate-600">{cat.name}</div>
              <div className="mt-1 space-y-0.5">
                {articles
                  .filter((a) => a.categoryId === cat.id)
                  .map((a) => (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/app/knowledge-base/${a.id}`)}
                      className={`block w-full truncate rounded px-2 py-1 text-left text-sm ${
                        articleId === a.id ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {a.title || "Untitled"}
                      {a.status === "DRAFT" && <span className="ml-1 text-[10px] text-slate-400">(draft)</span>}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={addArticle}
          className="mt-4 w-full rounded bg-brand-600 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          + New article
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {articleId ? (
          <ArticleEditor
            key={articleId}
            workspaceId={workspaceId}
            articleId={articleId}
            categories={categories}
            onDeleted={() => navigate("/app/knowledge-base")}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Select or create an article
          </div>
        )}
      </div>
    </div>
  );
}

function ArticleEditor({
  workspaceId,
  articleId,
  categories,
  onDeleted,
}: {
  workspaceId: string;
  articleId: string;
  categories: { id: string; name: string }[];
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const articleQuery = useQuery({
    queryKey: ["kb-article", workspaceId, articleId],
    queryFn: () => kbApi.getArticle(workspaceId, articleId),
  });
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [contentJson, setContentJson] = useState<unknown>(null);
  const [contentHtml, setContentHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const article = articleQuery.data;
  if (article && loadedFor !== articleId) {
    setTitle(article.title);
    setCategoryId(article.categoryId);
    setContentJson(article.contentJson);
    setContentHtml(article.contentHtml);
    setLoadedFor(articleId);
  }

  async function save(status?: "DRAFT" | "PUBLISHED") {
    setSaving(true);
    try {
      await kbApi.updateArticle(workspaceId, articleId, {
        title,
        categoryId,
        contentJson,
        contentHtml,
        ...(status ? { status } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ["kb-articles", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["kb-article", workspaceId, articleId] });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this article?")) return;
    await kbApi.deleteArticle(workspaceId, articleId);
    await queryClient.invalidateQueries({ queryKey: ["kb-articles", workspaceId] });
    onDeleted();
  }

  if (!article) return <div className="p-6 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Article title"
          className="flex-1 border-b border-transparent text-2xl font-semibold text-slate-900 focus:border-slate-300 focus:outline-none"
        />
        <span
          className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${
            article.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {article.status}
        </span>
      </div>

      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="mt-3 rounded border border-slate-200 px-2 py-1 text-sm"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="mt-4">
        <RichTextEditor contentJson={contentJson} onChange={(json, html) => { setContentJson(json); setContentHtml(html); }} />
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => save()}
          disabled={saving}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          onClick={() => save("PUBLISHED")}
          disabled={saving}
          className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {article.status === "PUBLISHED" ? "Update & keep published" : "Publish"}
        </button>
        {article.status === "PUBLISHED" && (
          <button
            onClick={() => save("DRAFT")}
            disabled={saving}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Unpublish
          </button>
        )}
        <button onClick={remove} className="ml-auto text-sm text-red-500 hover:underline">
          Delete
        </button>
      </div>
    </div>
  );
}
