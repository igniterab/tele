import { api } from "./api";
import type { DomainDTO } from "@tele/shared";

export const domainsApi = {
  list: (workspaceId: string) =>
    api.get<{ domains: DomainDTO[] }>(`/api/workspaces/${workspaceId}/domains`).then((r) => r.domains),

  add: (workspaceId: string, hostname: string) =>
    api.post<{ domain: DomainDTO }>(`/api/workspaces/${workspaceId}/domains`, { hostname }).then((r) => r.domain),

  recheck: (workspaceId: string, domainId: string) =>
    api.post(`/api/workspaces/${workspaceId}/domains/${domainId}/recheck`),

  remove: (workspaceId: string, domainId: string) =>
    api.delete(`/api/workspaces/${workspaceId}/domains/${domainId}`),
};
