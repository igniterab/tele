import { z } from "zod";
import { Channel, ConversationStatus } from "../enums.js";

export const listConversationsQuerySchema = z.object({
  channel: z.enum([Channel.CHAT, Channel.EMAIL]).optional(),
  status: z.enum([ConversationStatus.OPEN, ConversationStatus.SNOOZED, ConversationStatus.RESOLVED]).optional(),
  assigneeId: z.string().uuid().optional(),
  unassigned: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const assignConversationSchema = z.object({
  assigneeId: z.string().uuid().nullable(),
});
export type AssignConversationInput = z.infer<typeof assignConversationSchema>;

export const snoozeConversationSchema = z.object({
  snoozedUntil: z.coerce.date(),
});
export type SnoozeConversationInput = z.infer<typeof snoozeConversationSchema>;

export const updateConversationStatusSchema = z.object({
  status: z.enum([ConversationStatus.OPEN, ConversationStatus.SNOOZED, ConversationStatus.RESOLVED]),
});
export type UpdateConversationStatusInput = z.infer<typeof updateConversationStatusSchema>;
