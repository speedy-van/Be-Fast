import type { FastifyRequest } from "fastify";
import { requireAdmin } from "./auth/access.js";
import { Prisma } from "./generated/prisma/client.ts";

interface AdminAuditWrite {
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}

export async function writeAdminAudit(
  tx: Prisma.TransactionClient,
  request: FastifyRequest,
  { action, entityType, entityId, before, after }: AdminAuditWrite,
) {
  const admin = requireAdmin(request);
  await tx.auditLog.create({
    data: {
      adminUserId: admin.sub,
      action,
      entityType,
      entityId,
      before: before === null ? Prisma.JsonNull : before,
      after: after === null ? Prisma.JsonNull : after,
      ip: request.ip,
    },
  });
}
