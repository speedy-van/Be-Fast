import {
  adminOrderMetricsQuerySchema,
  adminOrderMetricsSchema,
} from "@be-fast/contracts";
import type { CancellationReasonCode } from "@be-fast/domain";
import type { FastifyInstance } from "fastify";
import { requireAdminRole } from "../auth/access.js";
import { Prisma, type PrismaClient } from "../generated/prisma/client.ts";

interface MetricsBucket {
  reasonCode: CancellationReasonCode | null;
  orderCount: bigint;
  acceptedCount: bigint;
  deliveredCount: bigint;
  cancelledCount: bigint;
  responseCount: bigint;
  responseTotalMs: bigint;
}

function rateBps(numerator: bigint, denominator: bigint) {
  return denominator === 0n ? 0 : Number((numerator * 10_000n) / denominator);
}

export function registerOrderMetricsRoutes(
  api: FastifyInstance,
  db: PrismaClient,
) {
  api.get(
    "/admin/orders/metrics",
    { preHandler: requireAdminRole("SUPER_ADMIN", "OPERATIONS", "SUPPORT") },
    async (request) => {
      const { from, to } = adminOrderMetricsQuerySchema.parse(request.query);
      const fromFilter =
        from === undefined
          ? Prisma.empty
          : Prisma.sql`AND "createdAt" >= ${new Date(from)}`;
      const toFilter =
        to === undefined
          ? Prisma.empty
          : Prisma.sql`AND "createdAt" <= ${new Date(to)}`;
      const buckets = await db.$queryRaw<MetricsBucket[]>`
        WITH cohort AS (
          SELECT "id", "status", "createdAt", "acceptedAt",
            CASE WHEN "status" = 'REJECTED' THEN "finishedAt"
                 ELSE "acceptedAt" END AS "respondedAt"
          FROM "Order" WHERE true ${fromFilter} ${toFilter}
        )
        SELECT event."reasonCode"::text AS "reasonCode",
          COUNT(*) AS "orderCount",
          COUNT(cohort."acceptedAt") AS "acceptedCount",
          COUNT(*) FILTER (WHERE cohort."status" = 'DELIVERED') AS "deliveredCount",
          COUNT(*) FILTER (WHERE cohort."status" = 'CANCELLED') AS "cancelledCount",
          COUNT(cohort."respondedAt") AS "responseCount",
          COALESCE(SUM(EXTRACT(EPOCH FROM (cohort."respondedAt" - cohort."createdAt")) * 1000), 0)::bigint AS "responseTotalMs"
        FROM cohort
        LEFT JOIN "OrderStatusEvent" event ON cohort."status" = 'CANCELLED'
          AND event."orderId" = cohort."id" AND event."to" = 'CANCELLED'
        GROUP BY event."reasonCode"
        ORDER BY event."reasonCode" NULLS LAST
      `;
      let orderCount = 0n;
      let acceptedCount = 0n;
      let deliveredCount = 0n;
      let cancelledCount = 0n;
      let responseCount = 0n;
      let responseTotalMs = 0n;
      for (const bucket of buckets) {
        orderCount += bucket.orderCount;
        acceptedCount += bucket.acceptedCount;
        deliveredCount += bucket.deliveredCount;
        cancelledCount += bucket.cancelledCount;
        responseCount += bucket.responseCount;
        responseTotalMs += bucket.responseTotalMs;
      }
      return adminOrderMetricsSchema.parse({
        orderCount: Number(orderCount),
        completionRateBps: rateBps(deliveredCount, orderCount),
        acceptanceRateBps: rateBps(acceptedCount, orderCount),
        averageResponseMs:
          responseCount === 0n ? null : Number(responseTotalMs / responseCount),
        cancellationByReason: buckets
          .filter((bucket) => bucket.cancelledCount > 0n)
          .map((bucket) => ({
            reasonCode: bucket.reasonCode,
            count: Number(bucket.cancelledCount),
            rateBps: rateBps(bucket.cancelledCount, cancelledCount),
          })),
      });
    },
  );
}
