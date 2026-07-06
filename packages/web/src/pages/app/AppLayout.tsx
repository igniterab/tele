import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";

export default function AppLayout() {
  const { user, workspaces, currentWorkspace, setCurrentWorkspaceId, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/login");
  }

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-md px-3 py-2 text-sm font-medium ${
      isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="flex h-screen">
      <aside className="flex w-56 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <div className="text-sm font-semibold text-slate-900">Tele</div>
          {workspaces.length > 1 ? (
            <select
              className="mt-2 w-full rounded border border-slate-200 py-1 text-xs"
              value={currentWorkspace?.id ?? ""}
              onChange={(e) => setCurrentWorkspaceId(e.target.value)}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="mt-1 truncate text-xs text-slate-500">{currentWorkspace?.name}</div>
          )}
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <NavLink to="/app/inbox" className={navItemClass}>
            Inbox
          </NavLink>
          <NavLink to="/app/knowledge-base" className={navItemClass}>
            Knowledge Base
          </NavLink>
          <NavLink to="/app/settings/team" className={navItemClass}>
            Team
          </NavLink>
          <NavLink to="/app/settings/domains" className={navItemClass}>
            Domains
          </NavLink>
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="truncate text-xs text-slate-500">{user?.email}</div>
          <button onClick={onLogout} className="mt-1 text-xs text-slate-400 hover:text-slate-700">
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-hidden">
        {currentWorkspace ? (
          <Outlet context={{ workspaceId: currentWorkspace.id, role: currentWorkspace.role }} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">No workspace</div>
        )}
      </main>
    </div>
  );
}
