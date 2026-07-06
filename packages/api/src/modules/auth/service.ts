import { prisma } from "../../db/client.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { slugify, withUniqueSuffix } from "../../lib/slug.js";
import { ApiError } from "../../plugins/error-handler.js";

export async function createWorkspaceAndAdmin(input: { name: string; email: string; password: string; workspaceName: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const baseSlug = slugify(input.workspaceName);

  return prisma.$transaction(async (tx) => {
    let slug = baseSlug;
    for (let attempts = 0; attempts < 5; attempts++) {
      const clash = await tx.workspace.findUnique({ where: { slug } });
      if (!clash) break;
      slug = withUniqueSuffix(baseSlug);
    }

    const user = await tx.user.create({
      data: { name: input.name, email: input.email, passwordHash },
    });
    const workspace = await tx.workspace.create({
      data: { name: input.workspaceName, slug },
    });
    const membership = await tx.membership.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "ADMIN", status: "ACTIVE" },
    });
    return { user, workspace, membership };
  });
}

export async function authenticateUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  return user;
}

export async function listUserWorkspaces(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId, status: "ACTIVE" },
    include: { workspace: true },
  });
  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    role: m.role,
  }));
}
