import { z } from "zod";
import { Role } from "../enums.js";
import { emailSchema } from "./auth.js";

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum([Role.ADMIN, Role.AGENT]),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum([Role.ADMIN, Role.AGENT]),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
