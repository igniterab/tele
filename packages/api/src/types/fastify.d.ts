import "fastify";
import type { Membership, User, Workspace } from "@prisma/client";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: User;
    membership?: Membership;
    workspace?: Workspace;
    visitor?: { contactId: string; workspaceId: string };
  }
}
