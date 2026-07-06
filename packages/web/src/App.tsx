import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import AcceptInvite from "./pages/AcceptInvite";
import AppLayout from "./pages/app/AppLayout";
import Dashboard from "./pages/app/Dashboard";
import Inbox from "./pages/app/Inbox";
import TeamSettings from "./pages/app/TeamSettings";
import WidgetFrame from "./pages/WidgetFrame";
import KnowledgeBase from "./pages/app/KnowledgeBase";
import PublicKb from "./pages/PublicKb";
import PublicKbArticle from "./pages/PublicKbArticle";
import DomainSettings from "./pages/app/DomainSettings";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullscreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function FullscreenLoading() {
  return (
    <div className="flex h-screen items-center justify-center text-slate-400 text-sm">
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/accept-invite/:token" element={<AcceptInvite />} />
      <Route path="/widget-frame" element={<WidgetFrame />} />
      <Route path="/kb/:workspaceSlug" element={<PublicKb />} />
      <Route path="/kb/:workspaceSlug/:articleSlug" element={<PublicKbArticle />} />

      <Route
        path="/app/*"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="inbox/:conversationId" element={<Inbox />} />
        <Route path="knowledge-base" element={<KnowledgeBase />} />
        <Route path="knowledge-base/:articleId" element={<KnowledgeBase />} />
        <Route path="settings/team" element={<TeamSettings />} />
        <Route path="settings/domains" element={<DomainSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
