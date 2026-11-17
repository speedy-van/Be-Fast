import { adminAuditLogQuerySchema } from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import { requireAdminRole } from "../auth/access.js";
import type { PrismaClient } from "../generated/prisma/client.ts";

const pageSize = 100;

export function registerAdminAuditRoutes(
  api: FastifyInstance,
  db: PrismaClient,
) {
  api.get(
    "/admin/audit-log",
    { preHandler: requireAdminRole("SUPER_ADMIN") },
    async (request, reply) => {
      const { entityId, action, cursor } = adminAuditLogQuerySchema.parse(
        request.query,
      );
      const page = await db.auditLog.findMany({
        where: { entityId, action },
        take: pageSize + 1,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      const entries = page.slice(0, pageSize);
      const nextCursor =
        page.length > pageSize ? (entries.at(-1)?.id ?? null) : null;
      return reply
        .header("Cache-Control", "no-store")
        .send({ entries, nextCursor });
    },
  );
}
