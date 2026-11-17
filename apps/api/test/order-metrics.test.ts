import { randomUUID } from "node:crypto";
import { adminOrderMetricsSchema } from "@be-fast/contracts";
import { describe, expect, it } from "vitest";
import type { AdminRole } from "../src/generated/prisma/enums.ts";
import { openAuthTest } from "./auth-test-support.js";

async function adminHeaders(
  test: ReturnType<typeof openAuthTest>,
  role: AdminRole,
) {
  const user = await test.db.adminUser.create({
    data: {
      email: `${randomUUID()}@example.invalid`,
      passwordHash: "Fixture",
      totpSecret: "Fixture",
      role,
    },
  });
  const { accessToken } = await test.tokens.issue({
    aud: "admin",
    sub: user.id,
    role,
  });
  return { authorization: `Bearer ${accessToken}` };
}

describe("admin order metrics", () => {
  it("uses the creation cohort, accepted and rejected response times, and cancellation reasons", async () => {
    const test = openAuthTest();
    try {
      const headers = await adminHeaders(test, "OPERATIONS");
      const [customer, branch] = await Promise.all([
        test.db.customer.create({ data: { name: "Metrics customer" } }),
        test.db.branch.create({
          data: {
            restaurant: {
              create: { name: "Metrics restaurant", commissionRateBps: 0 },
            },
          },
        }),
      ]);
      const createdAt = new Date("2026-04-25T12:00:00.000Z");
      const later = (seconds: number) =>
        new Date(createdAt.getTime() + seconds * 1000);
      const base = {
        branchId: branch.id,
        customerId: customer.id,
        customerName: "Metrics customer",
        type: "PICKUP",
        createdAt,
        foodSubtotalMinor: 25_000n,
        deliveryFeeMinor: 0n,
        totalMinor: 25_000n,
        commissionRateBps: 0,
        commissionMinor: 0n,
      } as const;
      const orderData = () => ({
        ...base,
        orderNumber: `metrics-${randomUUID()}`,
        idempotencyKey: randomUUID(),
      });
      await test.db.order.createMany({
        data: [
          {
            ...orderData(),
            status: "DELIVERED",
            acceptedAt: later(15),
            finishedAt: later(300),
          },
          { ...orderData(), status: "REJECTED", finishedAt: later(30) },
          { ...orderData(), status: "EXPIRED", finishedAt: later(480) },
          { ...orderData(), status: "PENDING" },
          {
            ...orderData(),
            status: "DELIVERED",
            createdAt: later(-1),
            acceptedAt: later(1),
            finishedAt: later(500),
          },
        ],
      });
      await test.db.order.create({
        data: {
          ...orderData(),
          status: "CANCELLED",
          acceptedAt: later(45),
          finishedAt: later(300),
          statusEvents: {
            create: {
              from: "ACCEPTED",
              to: "CANCELLED",
              actorType: "ADMIN",
              reasonCode: "CUSTOMER_REQUEST",
              createdAt: later(300),
            },
          },
        },
      });
      await test.db.order.create({
        data: {
          ...orderData(),
          status: "CANCELLED",
          finishedAt: later(60),
          statusEvents: {
            create: {
              from: "PENDING",
              to: "CANCELLED",
              actorType: "CUSTOMER",
              createdAt: later(60),
            },
          },
        },
      });

      const response = await test.api.inject({
        method: "GET",
        url: "/admin/orders/metrics?from=2026-04-25T12:00:00Z&to=2026-04-25T12:00:00Z",
        headers,
      });
      expect(response.statusCode).toBe(200);
      expect(adminOrderMetricsSchema.parse(response.json())).toEqual({
        orderCount: 6,
        completionRateBps: 1666,
        acceptanceRateBps: 3333,
        averageResponseMs: 30_000,
        cancellationByReason: [
          { reasonCode: "CUSTOMER_REQUEST", count: 1, rateBps: 5000 },
          { reasonCode: null, count: 1, rateBps: 5000 },
        ],
      });
    } finally {
      await test.api.close();
    }
  }, 40_000);

  it("uses order-read permissions and returns defined metrics for an empty cohort", async () => {
    const test = openAuthTest();
    try {
      const url = "/admin/orders/metrics?to=2020-01-01T00:00:00Z";
      for (const role of ["SUPER_ADMIN", "SUPPORT", "FINANCE"] as const) {
        const headers = await adminHeaders(test, role);
        const response = await test.api.inject({ method: "GET", url, headers });
        expect(response.statusCode).toBe(role === "FINANCE" ? 403 : 200);
        if (role === "FINANCE") continue;
        expect(adminOrderMetricsSchema.parse(response.json())).toEqual({
          orderCount: 0,
          completionRateBps: 0,
          acceptanceRateBps: 0,
          averageResponseMs: null,
          cancellationByReason: [],
        });
      }
      const unauthenticated = await test.api.inject({ method: "GET", url });
      expect(unauthenticated.statusCode).toBe(401);
    } finally {
      await test.api.close();
    }
  }, 40_000);
});
