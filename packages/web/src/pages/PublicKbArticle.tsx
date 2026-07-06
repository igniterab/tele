import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { KbArticleDTO } from "@tele/shared";

export default function PublicKbArticle() {
  const { workspaceSlug, articleSlug } = useParams<{ workspaceSlug: string; articleSlug: string }>();
  const [article, setArticle] = useState<KbArticleDTO | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!workspaceSlug || !articleSlug) return;
    fetch(`/api/public/kb/${workspaceSlug}/articles/${articleSlug}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((data) => setArticle(data.article))
      .catch(() => setNotFound(true));
  }, [workspaceSlug, articleSlug]);

  if (notFound) {
    return <div className="p-10 text-center text-sm text-slate-400">Article not found.</div>;
  }
  if (!article) {
    return <div className="p-10 text-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link to={`/kb/${workspaceSlug}`} className="text-sm text-brand-600 hover:underline">
          ← Back to Help Center
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">{article.title}</h1>
        <div className="prose prose-slate mt-6 max-w-none" dangerouslySetInnerHTML={{ __html: article.contentHtml }} />
      </div>
    </div>
  );
}
