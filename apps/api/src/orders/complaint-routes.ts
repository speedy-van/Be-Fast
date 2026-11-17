import {
  adminComplaintListQuerySchema,
  complaintParamsSchema,
  createComplaintSchema,
  readOrderParamsSchema,
  resolveNonDeliveryComplaintSchema,
  reviewComplaintSchema,
} from "@be-fast/contracts";
import { messages } from "@be-fast/i18n";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { writeAdminAudit } from "../audit.js";
import { requireAdminRole, requireCustomer } from "../auth/access.js";
import { ApiError } from "../errors.js";
import { appendAdminLedgerEntry } from "../finance/ledger.js";
import { Prisma, type PrismaClient } from "../generated/prisma/client.ts";
import type {
  ComplaintStatus,
  OrderStatus,
} from "../generated/prisma/enums.ts";

const complaintReviewers = {
  preHandler: requireAdminRole("SUPER_ADMIN", "OPERATIONS", "SUPPORT"),
};
const openStatuses: ComplaintStatus[] = ["OPEN", "IN_PROGRESS"];
const newestFirst = [{ createdAt: "desc" as const }, { id: "desc" as const }];
const reversalReference = "NON_DELIVERY_REVERSAL";

const customerComplaintFields = {
  id: true,
  orderId: true,
  type: true,
  status: true,
  text: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ComplaintSelect;
const adminComplaintFields = {
  ...customerComplaintFields,
  customerId: true,
  internalNotes: true,
  nonDeliveryVerifiedAt: true,
} as const satisfies Prisma.ComplaintSelect;

async function lockComplaintOrder(
  tx: Prisma.TransactionClient,
  id: string,
  customerId?: string,
) {
  const ownership =
    customerId === undefined
      ? Prisma.empty
      : Prisma.sql`AND "customerId" = ${customerId}::uuid`;
  const [order] = await tx.$queryRaw<{ id: string; status: OrderStatus }[]>`
    SELECT "id", "status"::text AS "status" FROM "Order"
    WHERE "id" = ${id}::uuid ${ownership} FOR UPDATE
  `;
  if (!order) throw new ApiError(404, "NOT_FOUND");
  return order;
}

async function assertNoOpenComplaint(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const existing = await tx.complaint.findFirst({
    where: { orderId, status: { in: openStatuses } },
    select: { id: true },
  });
  if (existing) throw new ApiError(409, "CONFLICT");
}

async function requireComplaint(db: Prisma.TransactionClient, id: string) {
  const complaint = await db.complaint.findUnique({
    where: { id },
    select: adminComplaintFields,
  });
  if (!complaint) throw new ApiError(404, "NOT_FOUND");
  return complaint;
}

function reviewAuditFields(row: Awaited<ReturnType<typeof requireComplaint>>) {
  return {
    status: row.status,
    nonDeliveryVerifiedAt: row.nonDeliveryVerifiedAt?.toISOString() ?? null,
    hasInternalNotes: row.internalNotes !== null,
  };
}

async function settleNonDeliveryComplaint(
  tx: Prisma.TransactionClient,
  request: FastifyRequest,
  id: string,
) {
  const complaint = await requireComplaint(tx, id);
  const order = await lockComplaintOrder(tx, complaint.orderId);
  const before = await requireComplaint(tx, id);
  if (!before.nonDeliveryVerifiedAt || order.status !== "DELIVERED") {
    throw new ApiError(409, "CONFLICT");
  }
  if (before.status === "RESOLVED") return before;
  if (before.status !== "IN_PROGRESS") throw new ApiError(409, "CONFLICT");

  const adjustment = await tx.ledgerEntry.findFirst({
    where: {
      orderId: order.id,
      type: "ADJUSTMENT",
      reference: reversalReference,
    },
    select: { id: true },
  });
  let ledgerEntryId = adjustment?.id;
  if (ledgerEntryId === undefined) {
    const commission = await tx.ledgerEntry.findFirst({
      where: { orderId: order.id, type: "COMMISSION_ACCRUED" },
      select: { restaurantId: true, amountMinor: true },
    });
    if (!commission) throw new ApiError(409, "CONFLICT");
    const entry = await appendAdminLedgerEntry(tx, request, {
      restaurantId: commission.restaurantId,
      orderId: order.id,
      type: "ADJUSTMENT",
      amountMinor: -commission.amountMinor,
      reference: reversalReference,
      reason: messages.finance.nonDeliveryReversal,
    });
    ledgerEntryId = entry.id;
  }

  const after = await tx.complaint.update({
    where: { id },
    data: { status: "RESOLVED" },
    select: adminComplaintFields,
  });
  await writeAdminAudit(tx, request, {
    action: "COMPLAINT_RESOLVE_NON_DELIVERY",
    entityType: "Complaint",
    entityId: id,
    before: reviewAuditFields(before),
    after: { ...reviewAuditFields(after), ledgerEntryId },
  });
  return after;
}

export function registerComplaintRoutes(
  api: FastifyInstance,
  { db, now }: { db: PrismaClient; now: () => Date },
) {
  api.post("/customer/orders/:id/complaint", async (request, reply) => {
    const { id } = readOrderParamsSchema.parse(request.params);
    const { sub: customerId } = requireCustomer(request);
    const data = createComplaintSchema.parse(request.body);
    const complaint = await db.$transaction(async (tx) => {
      const order = await lockComplaintOrder(tx, id, customerId);
      if (data.type === "NOT_RECEIVED" && order.status !== "DELIVERED")
        throw new ApiError(409, "CONFLICT");
      await assertNoOpenComplaint(tx, order.id);
      return tx.complaint.create({
        data: { ...data, orderId: order.id, customerId },
        select: customerComplaintFields,
      });
    });
    return reply.code(201).send(complaint);
  });

  api.get("/customer/orders/:id/complaint", async (request) => {
    const { id } = readOrderParamsSchema.parse(request.params);
    const { sub: customerId } = requireCustomer(request);
    const order = await db.order.findFirst({
      where: { id, customerId },
      select: {
        complaints: {
          where: { customerId },
          orderBy: [{ status: "asc" }, ...newestFirst],
          take: 1,
          select: customerComplaintFields,
        },
      },
    });
    if (!order) throw new ApiError(404, "NOT_FOUND");
    return { complaint: order.complaints[0] ?? null };
  });

  api.get("/admin/complaints", complaintReviewers, async (request) => {
    const where = adminComplaintListQuerySchema.parse(request.query);
    const complaints = await db.complaint.findMany({
      where,
      orderBy: newestFirst,
      select: adminComplaintFields,
    });
    return { complaints };
  });

  api.get("/admin/complaints/:id", complaintReviewers, (request) => {
    const { id } = complaintParamsSchema.parse(request.params);
    return requireComplaint(db, id);
  });

  api.post(
    "/admin/complaints/:id/resolve-non-delivery",
    { preHandler: requireAdminRole("SUPER_ADMIN") },
    (request) => {
      const { id } = complaintParamsSchema.parse(request.params);
      resolveNonDeliveryComplaintSchema.parse(request.body);
      return db.$transaction((tx) =>
        settleNonDeliveryComplaint(tx, request, id),
      );
    },
  );

  api.patch("/admin/complaints/:id", complaintReviewers, (request) => {
    const { id } = complaintParamsSchema.parse(request.params);
    const { status, internalNotes, verifyNonDelivery } =
      reviewComplaintSchema.parse(request.body);
    return db.$transaction(async (tx) => {
      const complaint = await requireComplaint(tx, id);
      const order = await lockComplaintOrder(tx, complaint.orderId);
      const before = await requireComplaint(tx, id);
      const nextStatus = verifyNonDelivery
        ? "IN_PROGRESS"
        : (status ?? before.status);
      if (before.nonDeliveryVerifiedAt && nextStatus !== before.status)
        throw new ApiError(409, "CONFLICT");
      if (
        verifyNonDelivery &&
        (before.type !== "NOT_RECEIVED" ||
          order.status !== "DELIVERED" ||
          before.status === "RESOLVED" ||
          (status !== undefined && status !== "IN_PROGRESS"))
      )
        throw new ApiError(409, "CONFLICT");
      if (before.status === "RESOLVED" && nextStatus !== "RESOLVED") {
        await assertNoOpenComplaint(tx, order.id);
      }

      const after = await tx.complaint.update({
        where: { id },
        data: {
          status: nextStatus,
          internalNotes,
          nonDeliveryVerifiedAt: verifyNonDelivery
            ? (before.nonDeliveryVerifiedAt ?? now())
            : undefined,
        },
        select: adminComplaintFields,
      });
      await writeAdminAudit(tx, request, {
        action: verifyNonDelivery
          ? "COMPLAINT_VERIFY_NON_DELIVERY"
          : "COMPLAINT_UPDATE",
        entityType: "Complaint",
        entityId: id,
        before: reviewAuditFields(before),
        after: {
          ...reviewAuditFields(after),
          internalNotesChanged: before.internalNotes !== after.internalNotes,
        },
      });
      return after;
    });
  });
}
