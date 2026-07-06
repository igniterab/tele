import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace";
import { domainsApi } from "../../lib/domainsApi";
import { ApiClientError } from "../../lib/api";
import type { DomainDTO } from "@tele/shared";

const STATUS_LABEL: Record<DomainDTO["status"], string> = {
  PENDING: "Waiting for DNS records",
  VERIFIED: "DNS verified — provisioning SSL",
  SSL_PROVISIONING: "Provisioning SSL certificate",
  ACTIVE: "Live",
  FAILED: "Failed",
};

const STATUS_COLOR: Record<DomainDTO["status"], string> = {
  PENDING: "bg-slate-100 text-slate-600",
  VERIFIED: "bg-amber-50 text-amber-700",
  SSL_PROVISIONING: "bg-amber-50 text-amber-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
};

export default function DomainSettings() {
  const { workspaceId, role } = useWorkspace();
  const queryClient = useQueryClient();
  const domainsQuery = useQuery({
    queryKey: ["domains", workspaceId],
    queryFn: () => domainsApi.list(workspaceId),
    refetchInterval: 10_000, // watch the verification state machine advance without manual refresh
  });

  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isAdmin = role === "ADMIN";

  async function addDomain(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await domainsApi.add(workspaceId, hostname.trim());
      setHostname("");
      queryClient.invalidateQueries({ queryKey: ["domains", workspaceId] });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function recheck(domainId: string) {
    await domainsApi.recheck(workspaceId, domainId);
    setTimeout(() => queryClient.invalidateQueries({ queryKey: ["domains", workspaceId] }), 1000);
  }

  async function remove(domainId: string) {
    if (!confirm("Disconnect this domain?")) return;
    await domainsApi.remove(workspaceId, domainId);
    queryClient.invalidateQueries({ queryKey: ["domains", workspaceId] });
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-lg font-semibold text-slate-900">Custom Domains</h1>
      <p className="mt-1 text-sm text-slate-500">
        Connect your own domain (e.g. <code>help.yourcompany.com</code>) to your public knowledge base.
      </p>

      {isAdmin && (
        <form onSubmit={addDomain} className="mt-6 flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex-1">
            <label htmlFor="domain-hostname" className="block text-xs font-medium text-slate-600">
              Domain
            </label>
            <input
              id="domain-hostname"
              required
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="help.yourcompany.com"
              className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Connect
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 space-y-4">
        {domainsQuery.data?.map((d) => (
          <div key={d.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium text-slate-900">{d.hostname}</div>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[d.status]}`}>
                {STATUS_LABEL[d.status]}
              </span>
            </div>

            {d.status !== "ACTIVE" && (
              <div className="mt-3 space-y-2 rounded bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-medium text-slate-700">Add these DNS records at your domain provider:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="pr-4 font-normal">Type</th>
                        <th className="pr-4 font-normal">Name</th>
                        <th className="font-normal">Value</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      <tr>
                        <td className="pr-4 py-1">TXT</td>
                        <td className="pr-4 py-1">{d.instructions.txtRecordName}</td>
                        <td className="py-1">{d.instructions.txtRecordValue}</td>
                      </tr>
                      <tr>
                        <td className="pr-4 py-1">CNAME</td>
                        <td className="pr-4 py-1">{d.hostname}</td>
                        <td className="py-1">{d.instructions.cnameTarget}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-slate-400">
                  DNS changes can take a few minutes to propagate. We check automatically every 20 seconds.
                </p>
              </div>
            )}

            {isAdmin && (
              <div className="mt-3 flex gap-3 text-xs">
                <button onClick={() => recheck(d.id)} className="text-brand-600 hover:underline">
                  Check now
                </button>
                <button onClick={() => remove(d.id)} className="text-red-500 hover:underline">
                  Disconnect
                </button>
              </div>
            )}
          </div>
        ))}
        {domainsQuery.data?.length === 0 && <p className="text-sm text-slate-400">No custom domains connected.</p>}
      </div>
    </div>
  );
}
