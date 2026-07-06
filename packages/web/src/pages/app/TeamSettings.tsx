import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace";
import { membersApi } from "../../lib/membersApi";
import { api, ApiClientError } from "../../lib/api";
import type { Role } from "@tele/shared";

export default function TeamSettings() {
  const { workspaceId, role } = useWorkspace();
  const queryClient = useQueryClient();
  const membersQuery = useQuery({
    queryKey: ["members", workspaceId],
    queryFn: () => membersApi.list(workspaceId),
  });

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("AGENT");
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = role === "ADMIN";

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteUrl(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ acceptUrl: string }>(`/api/workspaces/${workspaceId}/invites`, {
        email,
        role: inviteRole,
      });
      setInviteUrl(res.acceptUrl);
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["members", workspaceId] });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function changeRole(membershipId: string, newRole: Role) {
    await api.patch(`/api/workspaces/${workspaceId}/members/${membershipId}`, { role: newRole });
    queryClient.invalidateQueries({ queryKey: ["members", workspaceId] });
  }

  async function removeMember(membershipId: string) {
    if (!confirm("Remove this team member?")) return;
    await api.delete(`/api/workspaces/${workspaceId}/members/${membershipId}`);
    queryClient.invalidateQueries({ queryKey: ["members", workspaceId] });
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-lg font-semibold text-slate-900">Team</h1>

      {isAdmin && (
        <form onSubmit={onInvite} className="mt-6 flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex-1">
            <label htmlFor="invite-email" className="block text-xs font-medium text-slate-600">Invite by email</label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="teammate@company.com"
            />
          </div>
          <div>
            <label htmlFor="invite-role" className="block text-xs font-medium text-slate-600">Role</label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="AGENT">Agent</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Invite
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {inviteUrl && (
        <p className="mt-2 break-all rounded bg-emerald-50 p-2 text-xs text-emerald-700">
          Invite sent — dev accept link: {inviteUrl}
        </p>
      )}

      <div className="mt-6 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {membersQuery.data?.map((m) => (
          <div key={m.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-900">{m.name}</div>
              <div className="text-xs text-slate-400">{m.email}</div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin ? (
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m.id, e.target.value as Role)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs"
                >
                  <option value="AGENT">Agent</option>
                  <option value="ADMIN">Admin</option>
                </select>
              ) : (
                <span className="text-xs text-slate-500">{m.role}</span>
              )}
              {isAdmin && (
                <button onClick={() => removeMember(m.id)} className="text-xs text-red-500 hover:underline">
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
