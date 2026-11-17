import {
  adminCustomerBlockSchema,
  adminCustomerSearchQuerySchema,
  adminResourceParamsSchema,
} from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import { writeAdminAudit } from "../audit.js";
import { requireAdmin, requireAdminRole } from "../auth/access.js";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { orderReadInclude, serializeOrder } from "../orders/read-model.js";

const customerFields = {
  id: true,
  name: true,
  phone: true,
  blockedAt: true,
  createdAt: true,
} as const satisfies Prisma.CustomerSelect;

const readers = { preHandler: requireAdminRole("SUPER_ADMIN", "SUPPORT") };
const writers = { preHandler: requireAdminRole("SUPER_ADMIN") };

export function registerAdminCustomerRoutes(
  api: FastifyInstance,
  { db, now }: { db: PrismaClient; now: () => Date },
) {
  api.get("/admin/customers", readers, async (request, reply) => {
    const { phone } = adminCustomerSearchQuerySchema.parse(request.query);
    const customers = await db.customer.findMany({
      where: { phone, deletedAt: null },
      select: customerFields,
    });
    return reply.header("Cache-Control", "no-store").send({ customers });
  });

  api.get("/admin/customers/:id", readers, async (request, reply) => {
    const { id } = adminResourceParamsSchema.parse(request.params);
    const match = await db.customer.findUnique({
      where: { id, deletedAt: null },
      select: {
        ...customerFields,
        orders: {
          include: orderReadInclude,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
      },
    });
    if (!match) throw new ApiError(404, "NOT_FOUND");
    const { orders, ...customer } = match;
    const viewer = requireAdmin(request);
    const instant = now();
    return reply.header("Cache-Control", "no-store").send({
      customer,
      orders: orders.map((order) => serializeOrder(order, viewer, instant)),
    });
  });

  api.patch("/admin/customers/:id/block", writers, async (request, reply) => {
    const { id } = adminResourceParamsSchema.parse(request.params);
    const { blocked, reason } = adminCustomerBlockSchema.parse(request.body);
    const customer = await db.$transaction(async (tx) => {
      // Serialize against order creation, which locks the same customer row.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Customer" WHERE "id" = ${id}::uuid AND "deletedAt" IS NULL FOR UPDATE
      `;
      if (rows.length === 0) throw new ApiError(404, "NOT_FOUND");
      const before = await tx.customer.findUniqueOrThrow({
        where: { id },
        select: customerFields,
      });
      if (blocked === (before.blockedAt !== null)) return before;
      const after = await tx.customer.update({
        where: { id },
        data: { blockedAt: blocked ? now() : null },
        select: customerFields,
      });
      await writeAdminAudit(tx, request, {
        action: blocked ? "CUSTOMER_BLOCK" : "CUSTOMER_UNBLOCK",
        entityType: "Customer",
        entityId: id,
        before: { blockedAt: before.blockedAt?.toISOString() ?? null },
        after: { blockedAt: after.blockedAt?.toISOString() ?? null, reason },
      });
      return after;
    });
    return reply.header("Cache-Control", "no-store").send(customer);
  });
}
