import { z } from "zod";

const uuid = z.uuid();
const minor = z.number().int();
const requiredText = z.string().trim().min(1);
const currencyDisplayMode = z.enum(["OLD", "NEW"]);

export const recordPaymentSchema = z.strictObject({
  amountMinor: minor.positive(),
  paymentDate: z.iso.date(),
  paymentMethod: requiredText,
  reference: requiredText,
});

export const recordAdjustmentSchema = z.strictObject({
  amountMinor: minor.refine((value) => value !== 0),
  reason: requiredText,
});

export const ledgerEntrySchema = z.strictObject({
  id: uuid,
  restaurantId: uuid,
  orderId: uuid.nullable(),
  type: z.enum(["COMMISSION_ACCRUED", "PAYMENT_RECEIVED", "ADJUSTMENT"]),
  amountMinor: minor,
  paymentDate: z.iso.date().nullable(),
  paymentMethod: z.string().nullable(),
  reference: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const financeLedgerResponseSchema = z.strictObject({
  restaurantId: uuid,
  currencyDisplayMode,
  entries: z.array(ledgerEntrySchema),
});

export const restaurantBalancesResponseSchema = z.strictObject({
  currencyDisplayMode,
  restaurants: z.array(
    z.strictObject({
      restaurantId: uuid,
      name: z.string().nullable(),
      balanceMinor: minor,
    }),
  ),
});

export type LedgerEntryResponse = z.infer<typeof ledgerEntrySchema>;
