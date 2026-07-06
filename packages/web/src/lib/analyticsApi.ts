import type { AnalyticsDTO } from "@tele/shared";
import { api } from "./api";

export const analyticsApi = {
  get: (workspaceId: string) =>
    api.get<{ analytics: AnalyticsDTO }>(`/api/workspaces/${workspaceId}/analytics`).then((r) => r.analytics),
};
