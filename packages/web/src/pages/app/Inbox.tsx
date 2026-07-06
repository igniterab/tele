import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConversationDTO } from "@tele/shared";
import { useWorkspace } from "../../lib/workspace";
import { conversationsApi, type ConversationFilters } from "../../lib/conversationsApi";
import { getAgentSocket } from "../../lib/socket";
import ConversationList from "./components/ConversationList";
import ConversationDetail from "./components/ConversationDetail";

export default function Inbox() {
  const { workspaceId } = useWorkspace();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ConversationFilters>({ status: "OPEN" });

  const conversationsQuery = useQuery({
    queryKey: ["conversations", workspaceId, filters],
    queryFn: () => conversationsApi.list(workspaceId, filters),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const socket = getAgentSocket(workspaceId);

    function upsert(updated: ConversationDTO) {
      queryClient.setQueriesData<ConversationDTO[]>({ queryKey: ["conversations", workspaceId] }, (prev) => {
        if (!prev) return prev;
        const idx = prev.findIndex((c) => c.id === updated.id);
        if (idx === -1) return [updated, ...prev];
        const next = [...prev];
        next[idx] = updated;
        return next.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
      });
      queryClient.setQueryData(["conversation", workspaceId, updated.id], updated);
    }

    socket.on("conversation:updated", upsert);
    socket.on("connect", () => conversationsQuery.refetch());
    return () => {
      socket.off("conversation:updated", upsert);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const conversations = conversationsQuery.data ?? [];

  return (
    <div className="flex h-full">
      <ConversationList
        conversations={conversations}
        isLoading={conversationsQuery.isLoading}
        filters={filters}
        onFiltersChange={setFilters}
        selectedId={conversationId}
        onSelect={(id) => navigate(`/app/inbox/${id}`)}
      />
      {conversationId ? (
        <ConversationDetail workspaceId={workspaceId} conversationId={conversationId} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Select a conversation
        </div>
      )}
    </div>
  );
}
