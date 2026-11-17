import { z } from "zod";

const reportPeriodSchema = z.enum(["day", "week", "month"]);
const reportDateSchema = z.iso
  .date()
  .refine((date) => !date.startsWith("0000"));
const minor = z.int().nonnegative();

export const restaurantReportQuerySchema = z.strictObject({
  period: reportPeriodSchema,
  date: reportDateSchema,
});

export const restaurantReportSummarySchema = restaurantReportQuerySchema.extend(
  {
    orderValueMinor: minor,
    completedSalesMinor: minor,
    cashCollectedMinor: minor,
    commissionMinor: minor,
    currencyDisplayMode: z.enum(["OLD", "NEW"]),
  },
);

export type RestaurantReportSummary = z.infer<
  typeof restaurantReportSummarySchema
>;
