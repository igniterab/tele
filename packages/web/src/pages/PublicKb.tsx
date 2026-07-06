import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { KbArticleDTO } from "@tele/shared";

interface CategoryWithArticles {
  id: string;
  name: string;
  slug: string;
  articles: KbArticleDTO[];
}

export default function PublicKb() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const [workspaceName, setWorkspaceName] = useState("");
  const [categories, setCategories] = useState<CategoryWithArticles[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KbArticleDTO[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceSlug) return;
    fetch(`/api/public/kb/${workspaceSlug}/categories`)
      .then((r) => r.json())
      .then((data) => {
        setWorkspaceName(data.workspace?.name ?? "");
        setCategories(data.categories ?? []);
      })
      .finally(() => setLoading(false));
  }, [workspaceSlug]);

  useEffect(() => {
    if (!workspaceSlug || !query.trim()) {
      setResults(null);
      return;
    }
    const handle = setTimeout(() => {
      fetch(`/api/public/kb/${workspaceSlug}/search?q=${encodeURIComponent(query)}&limit=20`)
        .then((r) => r.json())
        .then((data) => setResults(data.articles ?? []));
    }, 250);
    return () => clearTimeout(handle);
  }, [workspaceSlug, query]);

  if (loading) {
    return <div className="p-10 text-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold text-slate-900">{workspaceName} Help Center</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for help…"
          className="mt-6 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />

        {results !== null ? (
          <div className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {results.length} result{results.length === 1 ? "" : "s"}
            </h2>
            <div className="mt-3 space-y-3">
              {results.map((a) => (
                <Link
                  key={a.id}
                  to={`/kb/${workspaceSlug}/${a.slug}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300"
                >
                  <div className="font-medium text-slate-900">{a.title}</div>
                  {a.excerpt && <div className="mt-1 text-sm text-slate-500" dangerouslySetInnerHTML={{ __html: a.excerpt }} />}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-10 space-y-8">
            {categories.map((cat) => (
              <div key={cat.id}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{cat.name}</h2>
                <div className="mt-3 space-y-2">
                  {cat.articles.map((a) => (
                    <Link
                      key={a.id}
                      to={`/kb/${workspaceSlug}/${a.slug}`}
                      className="block rounded-lg border border-slate-200 bg-white p-4 font-medium text-slate-900 hover:border-brand-300"
                    >
                      {a.title}
                    </Link>
                  ))}
                  {cat.articles.length === 0 && <p className="text-sm text-slate-400">No published articles yet.</p>}
                </div>
              </div>
            ))}
            {categories.length === 0 && <p className="text-sm text-slate-400">No help articles published yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
