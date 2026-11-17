import { CANCELLATION_REASON_CODES } from "@be-fast/domain";
import { z } from "zod";

const instant = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();
const rateBps = count.max(10_000);

export const adminOrderMetricsQuerySchema = z
  .strictObject({ from: instant.optional(), to: instant.optional() })
  .refine(
    ({ from, to }) =>
      from === undefined ||
      to === undefined ||
      Date.parse(from) <= Date.parse(to),
  );

export const adminOrderMetricsSchema = z.strictObject({
  orderCount: count,
  completionRateBps: rateBps,
  acceptanceRateBps: rateBps,
  averageResponseMs: count.nullable(),
  cancellationByReason: z.array(
    z.strictObject({
      reasonCode: z.enum(CANCELLATION_REASON_CODES).nullable(),
      count,
      rateBps,
    }),
  ),
});
