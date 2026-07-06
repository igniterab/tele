import { useOutletContext } from "react-router-dom";
import type { Role } from "@tele/shared";

export interface WorkspaceOutletContext {
  workspaceId: string;
  role: Role;
}

export function useWorkspace() {
  return useOutletContext<WorkspaceOutletContext>();
}
