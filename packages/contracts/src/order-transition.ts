import {
  CANCELLATION_REASON_CODES,
  DELIVERY_FAILURE_REASON_CODES,
  ORDER_STATUSES,
  REJECTION_REASON_CODES,
} from "@be-fast/domain";
import { z } from "zod";

const transitionReasonCodes = [
  ...new Set([
    ...REJECTION_REASON_CODES,
    ...CANCELLATION_REASON_CODES,
    ...DELIVERY_FAILURE_REASON_CODES,
  ]),
];

export const orderTransitionParamsSchema = z.strictObject({ id: z.uuid() });

export const restaurantOrderTransitionSchema = z.strictObject({
  to: z.enum(ORDER_STATUSES),
  prepMinutes: z.number().int().optional(),
  reasonCode: z.enum(transitionReasonCodes).optional(),
  note: z.string().optional(),
});

export const orderCancellationSchema = z.strictObject({
  reasonCode: z.enum(transitionReasonCodes).optional(),
  note: z.string().optional(),
});
