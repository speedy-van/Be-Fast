import {
  restaurantReportQuerySchema,
  type RestaurantReportSummary,
} from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import { requireRestaurant, requireRestaurantRole } from "../auth/access.js";
import { browseCurrencyMode } from "../browse/shared.js";
import { ApiError } from "../errors.js";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { minorNumber } from "../menu/shared.js";

type ReportAmounts = {
  orderValueMinor: bigint;
  completedSalesMinor: bigint;
  cashCollectedMinor: bigint;
  commissionMinor: bigint;
};

// Derive UTC bounds from local calendar dates before filtering the stored instants.
async function reportAmounts(
  db: PrismaClient,
  restaurantId: string,
  { date, period }: Pick<RestaurantReportSummary, "date" | "period">,
): Promise<ReportAmounts> {
  const [amounts] = await db.$queryRaw<ReportAmounts[]>`
    WITH anchor AS (
      SELECT ${date}::date AS local_day, ${period}::text AS period
    ), local_calendar AS (
      SELECT
        CASE period
          WHEN 'week' THEN local_day - ((extract(dow FROM local_day)::integer + 1) % 7)
          WHEN 'month' THEN date_trunc('month', local_day::timestamp)::date
          ELSE local_day
        END AS start_day,
        CASE period
          WHEN 'week' THEN interval '7 days'
          WHEN 'month' THEN interval '1 month'
          ELSE interval '1 day'
        END AS duration
      FROM anchor
    ), bounds AS (
      SELECT start_day::timestamp AT TIME ZONE 'Asia/Damascus' AS starts_at,
             (start_day + duration) AT TIME ZONE 'Asia/Damascus' AS ends_at
      FROM local_calendar
    ), branches AS (
      SELECT id FROM "Branch" WHERE "restaurantId" = ${restaurantId}::uuid
    ), created AS (
      SELECT coalesce(sum(o."totalMinor"), 0)::bigint AS "orderValueMinor"
      FROM "Order" o JOIN branches b ON b.id = o."branchId" CROSS JOIN bounds
      WHERE o."createdAt" >= starts_at AND o."createdAt" < ends_at
    ), delivered AS (
      SELECT coalesce(sum(o."foodSubtotalMinor"), 0)::bigint AS "completedSalesMinor",
             coalesce(sum(o."totalMinor"), 0)::bigint AS "cashCollectedMinor",
             coalesce(sum(o."commissionMinor"), 0)::bigint AS "commissionMinor"
      FROM "Order" o JOIN branches b ON b.id = o."branchId" CROSS JOIN bounds
      WHERE o.status = 'DELIVERED'
        AND o."finishedAt" >= starts_at AND o."finishedAt" < ends_at
    )
    SELECT created.*, delivered.* FROM created CROSS JOIN delivered
  `;
  if (!amounts) throw new ApiError(500, "INTERNAL_ERROR");
  return amounts;
}

export function registerRestaurantReportRoutes(
  api: FastifyInstance,
  { db }: { db: PrismaClient },
): void {
  api.get(
    "/restaurant/reports/summary",
    { preHandler: requireRestaurantRole("OWNER") },
    async (request): Promise<RestaurantReportSummary> => {
      const { restaurantId } = requireRestaurant(request);
      const filters = restaurantReportQuerySchema.parse(request.query);
      const [amounts, currencyDisplayMode] = await Promise.all([
        reportAmounts(db, restaurantId, filters),
        browseCurrencyMode(db),
      ]);
      return {
        ...filters,
        orderValueMinor: minorNumber(amounts.orderValueMinor),
        completedSalesMinor: minorNumber(amounts.completedSalesMinor),
        cashCollectedMinor: minorNumber(amounts.cashCollectedMinor),
        commissionMinor: minorNumber(amounts.commissionMinor),
        currencyDisplayMode,
      };
    },
  );
}
