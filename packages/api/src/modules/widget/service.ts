import { prisma } from "../../db/client.js";
import { signVisitorToken, verifyVisitorToken } from "../../lib/jwt.js";
import { ApiError } from "../../plugins/error-handler.js";

export async function bootstrapWidgetSession(workspaceSlug: string, existingToken?: string) {
  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
  if (!workspace) throw new ApiError(404, "WORKSPACE_NOT_FOUND", "Unknown workspace");

  if (existingToken) {
    try {
      const payload = verifyVisitorToken(existingToken);
      if (payload.workspaceId === workspace.id) {
        const contact = await prisma.contact.findUnique({ where: { id: payload.sub } });
        if (contact) {
          await prisma.contact.update({ where: { id: contact.id }, data: { lastSeenAt: new Date() } });
          return { workspace, contact, visitorToken: existingToken };
        }
      }
    } catch {
      // fall through to issuing a fresh session below
    }
  }

  const contact = await prisma.contact.create({
    data: { workspaceId: workspace.id, lastSeenAt: new Date() },
  });
  const visitorToken = signVisitorToken({ sub: contact.id, workspaceId: workspace.id });
  await prisma.contact.update({ where: { id: contact.id }, data: { visitorToken } });
  return { workspace, contact, visitorToken };
}
