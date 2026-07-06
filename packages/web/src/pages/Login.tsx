import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, ApiClientError } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { user, refetch } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/app" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/api/auth/login", { email, password });
      await refetch();
      navigate("/app");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in rounded-2xl border border-slate-100 bg-white/90 p-8 shadow-card backdrop-blur">
        <h1 className="text-xl font-semibold tracking-tight text-slate-800">Log in to Tele</h1>
        <p className="mt-1 text-sm text-slate-500">Welcome back.</p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">Email</label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">Password</label>
            <input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          No account? <Link to="/signup" className="text-brand-600 hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
