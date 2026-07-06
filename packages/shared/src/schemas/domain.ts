import { z } from "zod";

const hostnameRegex = /^(?=.{1,253}$)(?:(?:xn--)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export const addDomainSchema = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(hostnameRegex, "Must be a valid hostname, e.g. help.example.com"),
});
export type AddDomainInput = z.infer<typeof addDomainSchema>;
