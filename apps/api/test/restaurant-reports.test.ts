import { randomUUID } from "node:crypto";
import { restaurantReportSummarySchema } from "@be-fast/contracts";
import { describe, expect, it } from "vitest";
import type { RestaurantRole } from "../src/generated/prisma/enums.ts";
import { openAuthTest } from "./auth-test-support.js";

type ReportTest = ReturnType<typeof openAuthTest>;
type FixtureOrder = {
  createdAt: string;
  finishedAt: string;
  foodSubtotalMinor: bigint;
  deliveryFeeMinor?: bigint;
  status?: "DELIVERED" | "CANCELLED";
};

const integrationTimeoutMs = 40_000;
const reportUrl = "/restaurant/reports/summary";
let nextFixture = 0;

async function withReportTest(run: (test: ReportTest) => Promise<void>) {
  const test = openAuthTest();
  try {
    await run(test);
  } finally {
    await test.api.close();
  }
}

function createBranch({ db }: ReportTest) {
  return db.branch.create({
    data: {
      restaurant: {
        create: {
          name: "Report fixture restaurant",
          contactPhone: "+963988870000",
          status: "APPROVED",
          commissionRateBps: 1000,
        },
      },
    },
  });
}

async function restaurantHeaders(
  { db, tokens }: ReportTest,
  restaurantId: string,
  role: RestaurantRole,
) {
  const user = await db.restaurantUser.create({
    data: {
      restaurantId,
      phone: `+963${988870000 + ++nextFixture}`,
      passwordHash: "Fixture",
      role,
    },
  });
  const { accessToken } = await tokens.issue({
    aud: "restaurant",
    sub: user.id,
    restaurantId,
    role,
  });
  return { authorization: `Bearer ${accessToken}` };
}

function addOrders(
  { db }: ReportTest,
  branchId: string,
  customerId: string,
  orders: FixtureOrder[],
) {
  return db.order.createMany({
    data: orders.map(
      ({
        createdAt,
        finishedAt,
        foodSubtotalMinor,
        deliveryFeeMinor = 0n,
        status = "DELIVERED",
      }) => ({
        branchId,
        customerId,
        orderNumber: `BF-${888000 + ++nextFixture}`,
        idempotencyKey: randomUUID(),
        type: deliveryFeeMinor === 0n ? "PICKUP" : "DELIVERY",
        status,
        customerName: "Report fixture customer",
        createdAt: new Date(createdAt),
        finishedAt: new Date(finishedAt),
        foodSubtotalMinor,
        deliveryFeeMinor,
        totalMinor: foodSubtotalMinor + deliveryFeeMinor,
        commissionRateBps: 1000,
        commissionMinor: status === "DELIVERED" ? foodSubtotalMinor / 10n : 0n,
      }),
    ),
  });
}

describe("restaurant reports", () => {
  it(
    "uses Damascus creation and delivery dates for separate amounts and applies Saturday weeks and calendar months",
    () =>
      withReportTest(async (test) => {
        const branch = await createBranch(test);
        const otherBranch = await createBranch(test);
        const customer = await test.db.customer.create({
          data: { name: "Report fixture customer" },
        });
        const headers = await restaurantHeaders(
          test,
          branch.restaurantId,
          "OWNER",
        );
        await addOrders(test, branch.id, customer.id, [
          {
            createdAt: "2026-07-31T12:00:00Z",
            finishedAt: "2026-07-31T12:30:00Z",
            foodSubtotalMinor: 80_000n,
            deliveryFeeMinor: 10_000n,
          },
          {
            createdAt: "2026-07-31T13:00:00Z",
            finishedAt: "2026-07-31T13:30:00Z",
            status: "CANCELLED",
            foodSubtotalMinor: 20_000n,
            deliveryFeeMinor: 5_000n,
          },
          {
            createdAt: "2026-07-31T20:50:00Z",
            finishedAt: "2026-07-31T21:10:00Z",
            foodSubtotalMinor: 30_000n,
            deliveryFeeMinor: 4_000n,
          },
          {
            createdAt: "2026-07-31T21:00:00Z",
            finishedAt: "2026-07-31T22:00:00Z",
            foodSubtotalMinor: 10_000n,
            deliveryFeeMinor: 1_000n,
          },
          {
            createdAt: "2026-07-31T23:30:00Z",
            finishedAt: "2026-08-01T00:15:00Z",
            foodSubtotalMinor: 12_000n,
            deliveryFeeMinor: 500n,
          },
          {
            createdAt: "2026-08-02T12:00:00Z",
            finishedAt: "2026-08-02T12:30:00Z",
            foodSubtotalMinor: 2_000n,
          },
          {
            createdAt: "2026-08-07T21:00:00Z",
            finishedAt: "2026-08-07T21:30:00Z",
            foodSubtotalMinor: 3_000n,
          },
        ]);
        await addOrders(test, otherBranch.id, customer.id, [
          {
            createdAt: "2026-07-31T23:30:00Z",
            finishedAt: "2026-08-01T00:00:00Z",
            foodSubtotalMinor: 1_000_000n,
          },
        ]);

        for (const [
          period,
          date,
          orderValueMinor,
          completedSalesMinor,
          cashCollectedMinor,
          commissionMinor,
        ] of [
          ["day", "2026-07-31", 149_000, 80_000, 90_000, 8_000],
          ["day", "2026-08-01", 23_500, 52_000, 57_500, 5_200],
          ["week", "2026-08-03", 25_500, 54_000, 59_500, 5_400],
          ["month", "2026-08-11", 28_500, 57_000, 62_500, 5_700],
          ["day", "2026-08-11", 0, 0, 0, 0],
        ] as const) {
          const response = await test.api.inject({
            method: "GET",
            url: reportUrl,
            query: { period, date },
            headers,
          });
          expect(response.statusCode).toBe(200);
          expect(restaurantReportSummarySchema.parse(response.json())).toEqual({
            period,
            date,
            orderValueMinor,
            completedSalesMinor,
            cashCollectedMinor,
            commissionMinor,
            currencyDisplayMode: "OLD",
          });
        }
      }),
    integrationTimeoutMs,
  );

  it(
    "requires an owner and validates local calendar dates and periods",
    () =>
      withReportTest(async (test) => {
        const branch = await createBranch(test);
        const request = {
          method: "GET" as const,
          url: reportUrl,
          query: { period: "day", date: "2026-08-01" },
        };
        expect((await test.api.inject(request)).statusCode).toBe(401);
        for (const role of ["MANAGER", "CASHIER", "KITCHEN"] as const) {
          const headers = await restaurantHeaders(
            test,
            branch.restaurantId,
            role,
          );
          expect(
            (await test.api.inject({ ...request, headers })).statusCode,
          ).toBe(403);
        }
        const customer = await test.db.customer.create({
          data: { name: "Report fixture customer" },
        });
        const { accessToken } = await test.tokens.issue({
          aud: "customer",
          sub: customer.id,
        });
        const wrongAudience = await test.api.inject({
          ...request,
          headers: { authorization: `Bearer ${accessToken}` },
        });
        expect(wrongAudience.statusCode).toBe(403);

        const headers = await restaurantHeaders(
          test,
          branch.restaurantId,
          "OWNER",
        );
        const invalidFilters: Record<string, string>[] = [
          { date: "2026-02-30" },
          { date: "0000-01-01" },
          { period: "quarter" },
          { restaurantId: branch.restaurantId },
        ];
        for (const invalid of invalidFilters) {
          const response = await test.api.inject({
            ...request,
            headers,
            query: { ...request.query, ...invalid },
          });
          expect(response.statusCode).toBe(400);
        }
      }),
    integrationTimeoutMs,
  );
});
