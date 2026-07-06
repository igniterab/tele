import type { Contact, Conversation, User } from "@prisma/client";
import type { ConversationDTO, ConversationSummaryPayload } from "@tele/shared";

type ConversationWithRelations = Conversation & {
  contact: Contact;
  assignee: User | null;
  _unreadCount?: number;
};

export function toConversationDTO(conv: ConversationWithRelations): ConversationDTO {
  return {
    id: conv.id,
    channel: conv.channel,
    status: conv.status,
    subject: conv.subject,
    assigneeId: conv.assigneeId,
    assigneeName: conv.assignee?.name ?? null,
    contact: { id: conv.contact.id, name: conv.contact.name, email: conv.contact.email },
    lastMessageAt: conv.lastMessageAt.toISOString(),
    snoozedUntil: conv.snoozedUntil?.toISOString() ?? null,
    summary: (conv.summary as ConversationSummaryPayload | null) ?? null,
    summaryStatus: conv.summaryStatus ?? null,
    summaryUpdatedAt: conv.summaryUpdatedAt?.toISOString() ?? null,
    unreadCount: conv._unreadCount ?? 0,
    createdAt: conv.createdAt.toISOString(),
  };
}
