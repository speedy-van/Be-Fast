import type { LedgerEntryResponse } from "@be-fast/contracts";
import type { FastifyRequest } from "fastify";
import { writeAdminAudit } from "../audit.js";
import { requireAdmin } from "../auth/access.js";
import type { Prisma } from "../generated/prisma/client.ts";
import { minorNumber } from "../menu/shared.js";

export const ledgerEntryFields = {
  id: true,
  restaurantId: true,
  orderId: true,
  type: true,
  amountMinor: true,
  paymentDate: true,
  paymentMethod: true,
  reference: true,
  reason: true,
  createdAt: true,
} as const satisfies Prisma.LedgerEntrySelect;

export function serializeLedgerEntry(
  entry: Prisma.LedgerEntryGetPayload<{ select: typeof ledgerEntryFields }>,
): LedgerEntryResponse {
  return {
    ...entry,
    amountMinor: minorNumber(entry.amountMinor),
    paymentDate: entry.paymentDate?.toISOString().slice(0, 10) ?? null,
    reference: entry.type === "PAYMENT_RECEIVED" ? entry.reference : null,
    createdAt: entry.createdAt.toISOString(),
  };
}

type AdminLedgerWrite = {
  restaurantId: string;
  amountMinor: bigint;
} & (
  | {
      type: "PAYMENT_RECEIVED";
      paymentDate: Date;
      paymentMethod: string;
      reference: string;
    }
  | {
      type: "ADJUSTMENT";
      reason: string;
      orderId?: string;
      reference?: string;
    }
);

export async function appendAdminLedgerEntry(
  tx: Prisma.TransactionClient,
  request: FastifyRequest,
  data: AdminLedgerWrite,
) {
  const entry = serializeLedgerEntry(
    await tx.ledgerEntry.create({
      data: { ...data, createdByAdminId: requireAdmin(request).sub },
      select: ledgerEntryFields,
    }),
  );
  await writeAdminAudit(tx, request, {
    action:
      data.type === "PAYMENT_RECEIVED"
        ? "LEDGER_PAYMENT_CREATE"
        : "LEDGER_ADJUSTMENT_CREATE",
    entityType: "LedgerEntry",
    entityId: entry.id,
    after: {
      restaurantId: entry.restaurantId,
      orderId: entry.orderId,
      type: entry.type,
      amountMinor: entry.amountMinor,
      paymentDate: entry.paymentDate,
      createdAt: entry.createdAt,
      hasPaymentMethod: entry.paymentMethod !== null,
      hasReference: entry.reference !== null,
      hasReason: entry.reason !== null,
    },
  });
  return entry;
}
