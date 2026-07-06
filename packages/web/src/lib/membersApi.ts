import { api } from "./api";
import type { MemberDTO } from "@tele/shared";

export const membersApi = {
  list: (workspaceId: string) =>
    api.get<{ members: MemberDTO[] }>(`/api/workspaces/${workspaceId}/members`).then((r) => r.members),
};
