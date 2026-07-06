import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api, ApiClientError } from "../lib/api";
import { useAuth } from "../lib/auth";

interface InviteInfo {
  email: string;
  role: string;
  workspaceName: string;
}

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { user, refetch } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<InviteInfo>(`/api/invites/${token}`)
      .then(setInvite)
      .catch((err) => setLoadError(err instanceof ApiClientError ? err.message : "Invite not found"));
  }, [token]);

  if (user) return <Navigate to="/app" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/api/invites/${token}/accept`, { name, password });
      await refetch();
      navigate("/app");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-slate-600">{loadError}</p>
      </div>
    );
  }

  if (!invite) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400 text-sm">Loading…</div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Join {invite.workspaceName}</h1>
        <p className="mt-1 text-sm text-slate-500">
          You've been invited as <span className="font-medium">{invite.role}</span> ({invite.email}).
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="invite-name" className="block text-sm font-medium text-slate-700">Your name</label>
            <input
              id="invite-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="invite-password" className="block text-sm font-medium text-slate-700">Choose a password</label>
            <input
              id="invite-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? "Joining…" : "Accept invite"}
          </button>
        </form>
      </div>
    </div>
  );
}
