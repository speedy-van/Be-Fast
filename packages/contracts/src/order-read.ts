import {
  CANCELLATION_REASON_CODES,
  DELIVERY_FAILURE_REASON_CODES,
  ORDER_STATUSES,
  ORDER_TYPES,
  REJECTION_REASON_CODES,
} from "@be-fast/domain";
import { z } from "zod";

const uuid = z.uuid();
const minor = z.number().int().nonnegative();
const instant = z.iso.datetime({ offset: true });
const orderStatus = z.enum(ORDER_STATUSES);
const orderListFilters = {
  status: orderStatus.optional(),
  from: instant.optional(),
  to: instant.optional(),
};

function orderedRange({ from, to }: { from?: string; to?: string }) {
  return (
    from === undefined || to === undefined || Date.parse(from) <= Date.parse(to)
  );
}

export const readOrderParamsSchema = z.strictObject({ id: uuid });
export const restaurantOrderListQuerySchema = z
  .strictObject(orderListFilters)
  .refine(orderedRange);
export const adminOrderListQuerySchema = z
  .strictObject({ ...orderListFilters, q: z.string().trim().min(1).optional() })
  .refine(orderedRange);

const orderReadOptionSchema = z.strictObject({
  id: uuid,
  name: z.string(),
  priceMinor: minor.optional(),
});
const orderReadItemSchema = z.strictObject({
  id: uuid,
  name: z.string(),
  sizeName: z.string(),
  quantity: z.number().int().min(1).max(50),
  note: z.string().nullable(),
  unitPriceMinor: minor.optional(),
  totalMinor: minor.optional(),
  options: z.array(orderReadOptionSchema),
});
const orderReadEventSchema = z.strictObject({
  id: uuid,
  from: orderStatus.nullable(),
  to: orderStatus,
  actorType: z.enum(["CUSTOMER", "RESTAURANT", "ADMIN", "SYSTEM"]),
  actorId: uuid.nullable().optional(),
  reasonCode: z
    .enum([
      ...REJECTION_REASON_CODES,
      ...CANCELLATION_REASON_CODES,
      ...DELIVERY_FAILURE_REASON_CODES,
    ])
    .nullable(),
  note: z.string().nullable(),
  createdAt: instant,
});

export const orderReadSchema = z.strictObject({
  id: uuid,
  branchId: uuid,
  restaurantId: uuid,
  restaurantName: z.string().nullable(),
  restaurantPhone: z.string().nullable().optional(),
  orderNumber: z.string(),
  type: z.enum(ORDER_TYPES),
  status: orderStatus,
  customerId: uuid.optional(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable().optional(),
  addressSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  note: z.string().nullable(),
  createdAt: instant,
  acceptedAt: instant.nullable(),
  finishedAt: instant.nullable(),
  estimatedReadyAt: instant.nullable(),
  estimatedDeliveryAt: instant.nullable(),
  prepMinutes: z.number().int().nullable(),
  etaMinutes: z.number().int().nullable(),
  needsAttention: z.boolean().optional(),
  foodSubtotalMinor: minor.optional(),
  discountMinor: minor.optional(),
  deliveryFeeMinor: minor.optional(),
  totalMinor: minor.optional(),
  commissionMinor: minor.optional(),
  commissionRateBps: z.number().int().min(0).max(10_000).optional(),
  items: z.array(orderReadItemSchema),
  events: z.array(orderReadEventSchema),
});

export const orderListResponseSchema = z.strictObject({
  orders: z.array(orderReadSchema),
});
export type OrderReadResponse = z.infer<typeof orderReadSchema>;
