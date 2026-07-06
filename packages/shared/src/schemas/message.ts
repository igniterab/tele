import { z } from "zod";

export const sendMessageSchema = z.object({
  bodyHtml: z.string().min(1).max(50_000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const listMessagesQuerySchema = z.object({
  after: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const typingEventSchema = z.object({
  conversationId: z.string().uuid(),
});
export type TypingEventInput = z.infer<typeof typingEventSchema>;

export const widgetSessionSchema = z.object({
  workspaceSlug: z.string().min(1).max(80),
  visitorToken: z.string().optional(),
});
export type WidgetSessionInput = z.infer<typeof widgetSessionSchema>;
