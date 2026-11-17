import {
  adminResourceParamsSchema,
  adminUserRoleSchema,
} from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import { writeAdminAudit } from "../audit.js";
import { requireAdmin, requireAdminRole } from "../auth/access.js";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";

const userFields = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const satisfies Prisma.AdminUserSelect;
const staffManagers = { preHandler: requireAdminRole("SUPER_ADMIN") };

export function registerAdminStaffRoutes(
  api: FastifyInstance,
  db: PrismaClient,
) {
  api.get("/admin/users", staffManagers, async (_request, reply) => {
    const users = await db.adminUser.findMany({
      select: userFields,
      orderBy: [{ email: "asc" }, { id: "asc" }],
    });
    return reply.header("Cache-Control", "no-store").send({ users });
  });

  api.patch("/admin/users/:id/role", staffManagers, async (request, reply) => {
    const { id } = adminResourceParamsSchema.parse(request.params);
    const { role } = adminUserRoleSchema.parse(request.body);
    const actor = requireAdmin(request);
    const user = await db.$transaction(async (tx) => {
      // Concurrent role edits must not remove the last active super admin.
      await tx.$executeRaw`LOCK TABLE "AdminUser" IN SHARE ROW EXCLUSIVE MODE`;
      const [before, currentActor] = await Promise.all([
        tx.adminUser.findUnique({ where: { id }, select: userFields }),
        tx.adminUser.findUnique({
          where: { id: actor.sub },
          select: { role: true, isActive: true },
        }),
      ]);
      if (!currentActor?.isActive || currentActor.role !== "SUPER_ADMIN")
        throw new ApiError(403, "FORBIDDEN");
      if (!before) throw new ApiError(404, "NOT_FOUND");
      if (before.role === role) return before;
      if (before.role === "SUPER_ADMIN" && before.isActive) {
        const survivors = await tx.adminUser.count({
          where: { id: { not: id }, role: "SUPER_ADMIN", isActive: true },
        });
        if (survivors === 0) throw new ApiError(409, "CONFLICT");
      }
      const after = await tx.adminUser.update({
        where: { id },
        data: { role },
        select: userFields,
      });
      await writeAdminAudit(tx, request, {
        action: "ADMIN_USER_ROLE_UPDATE",
        entityType: "AdminUser",
        entityId: id,
        before: { role: before.role },
        after: { role: after.role },
      });
      return after;
    });
    return reply.header("Cache-Control", "no-store").send(user);
  });
}
