import type { Message, User } from "@prisma/client";
import type { MessageDTO } from "@tele/shared";

type MessageWithSender = Message & { sender?: User | null };

export function toMessageDTO(msg: MessageWithSender): MessageDTO {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    senderType: msg.senderType,
    senderId: msg.senderId,
    senderName: msg.sender?.name ?? null,
    bodyHtml: msg.bodyHtml,
    bodyText: msg.bodyText,
    channel: msg.channel,
    emailDeliveryStatus: (msg.emailDeliveryStatus as "SENT" | "FAILED" | null) ?? null,
    readAt: msg.readAt?.toISOString() ?? null,
    createdAt: msg.createdAt.toISOString(),
  };
}
