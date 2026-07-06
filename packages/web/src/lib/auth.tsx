import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Role } from "@tele/shared";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

interface MeResponse {
  user: CurrentUser;
  workspaces: WorkspaceSummary[];
}

interface AuthContextValue {
  user: CurrentUser | null;
  workspaces: WorkspaceSummary[];
  currentWorkspace: WorkspaceSummary | null;
  setCurrentWorkspaceId: (id: string) => void;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const WORKSPACE_STORAGE_KEY = "tele.currentWorkspaceId";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery<MeResponse>({
    queryKey: ["me"],
    queryFn: () => api.get<MeResponse>("/api/auth/me"),
    retry: false,
  });

  const [currentWorkspaceId, setCurrentWorkspaceIdState] = useState<string | null>(
    () => localStorage.getItem(WORKSPACE_STORAGE_KEY),
  );

  useEffect(() => {
    if (!data) return;
    const stillValid = data.workspaces.some((w) => w.id === currentWorkspaceId);
    if (!stillValid && data.workspaces.length > 0) {
      setCurrentWorkspaceIdState(data.workspaces[0].id);
    }
  }, [data, currentWorkspaceId]);

  const setCurrentWorkspaceId = (id: string) => {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
    setCurrentWorkspaceIdState(id);
  };

  const currentWorkspace = useMemo(
    () => data?.workspaces.find((w) => w.id === currentWorkspaceId) ?? null,
    [data, currentWorkspaceId],
  );

  const logout = async () => {
    await api.post("/api/auth/logout");
    queryClient.setQueryData(["me"], null);
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  return (
    <AuthContext.Provider
      value={{
        user: data?.user ?? null,
        workspaces: data?.workspaces ?? [],
        currentWorkspace,
        setCurrentWorkspaceId,
        isLoading,
        refetch,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
