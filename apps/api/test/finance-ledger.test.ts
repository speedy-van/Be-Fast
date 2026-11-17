import { randomInt, randomUUID } from "node:crypto";
import {
  errorEnvelopeSchema,
  financeLedgerResponseSchema,
  ledgerEntrySchema,
  restaurantBalancesResponseSchema,
} from "@be-fast/contracts";
import { calcCommission } from "@be-fast/domain";
import type { HTTPMethods } from "fastify";
import { expect, it } from "vitest";
import type {
  AdminRole,
  RestaurantRole,
} from "../src/generated/prisma/enums.ts";
import { openAuthTest } from "./auth-test-support.js";

type Test = ReturnType<typeof openAuthTest>;
const adminFinancePath = "/admin/finance/restaurants";
const ownerLedgerPath = "/restaurant/finance/ledger";
const payment = {
  amountMinor: 10_000,
  paymentDate: "2026-11-16",
  paymentMethod: "نقداً",
  reference: "إيصال 123",
};
const adjustment = { amountMinor: -1_333, reason: "تصحيح كشف الحساب" };
const commissionRateBps = 1_000;

function requester(test: Test, accessToken: string) {
  return (method: HTTPMethods, url: string, payload?: object) =>
    test.api.inject({
      method,
      url,
      payload,
      headers: { authorization: `Bearer ${accessToken}` },
    });
}

async function admin(test: Test, role: AdminRole) {
  const user = await test.db.adminUser.create({
    data: {
      email: `${randomUUID()}@example.invalid`,
      passwordHash: "fixture",
      totpSecret: "fixture",
      role,
    },
  });
  const { accessToken } = await test.tokens.issue({
    aud: "admin",
    sub: user.id,
    role,
  });
  return { id: user.id, request: requester(test, accessToken) };
}

async function restaurantUser(
  test: Test,
  restaurantId: string,
  role: RestaurantRole,
) {
  const user = await test.db.restaurantUser.create({
    data: {
      restaurantId,
      role,
      passwordHash: "fixture",
      phone: `+9639${String(randomInt(100_000_000)).padStart(8, "0")}`,
    },
  });
  const { accessToken } = await test.tokens.issue({
    aud: "restaurant",
    sub: user.id,
    restaurantId,
    role,
  });
  return requester(test, accessToken);
}

it("derives the balance from three delivered orders, a payment and a negative adjustment", async () => {
  const test = openAuthTest();
  try {
    const [restaurant, emptyRestaurant, finance, superAdmin, customer] =
      await Promise.all([
        test.db.restaurant.create({
          data: { name: "مطعم كشف الحساب", commissionRateBps },
        }),
        test.db.restaurant.create({
          data: { name: "مطعم بلا قيود", commissionRateBps },
        }),
        admin(test, "FINANCE"),
        admin(test, "SUPER_ADMIN"),
        test.db.customer.create({ data: {} }),
      ]);
    const [branch, owner, otherOwner] = await Promise.all([
      test.db.branch.create({ data: { restaurantId: restaurant.id } }),
      restaurantUser(test, restaurant.id, "OWNER"),
      restaurantUser(test, emptyRestaurant.id, "OWNER"),
    ]);
    const orders: { orderId: string; expectedCommissionMinor: number }[] = [];
    for (const [subtotal, expectedCommissionMinor] of [
      [80_000, 8_000],
      [33_333, 3_333],
      [120_000, 12_000],
    ] as const) {
      const order = await test.db.order.create({
        data: {
          branchId: branch.id,
          customerId: customer.id,
          customerName: "Fixture customer",
          idempotencyKey: randomUUID(),
          orderNumber: `Fixture-${randomUUID()}`,
          type: "PICKUP",
          status: "READY",
          foodSubtotalMinor: BigInt(subtotal),
          totalMinor: BigInt(subtotal),
          deliveryFeeMinor: 0n,
          commissionRateBps,
          commissionMinor: BigInt(calcCommission(subtotal, commissionRateBps)),
        },
        select: { id: true },
      });
      const delivered = await owner(
        "POST",
        `/restaurant/orders/${order.id}/transition`,
        {
          to: "DELIVERED",
        },
      );
      expect(delivered.statusCode).toBe(200);
      orders.push({ orderId: order.id, expectedCommissionMinor });
    }

    const restaurantPath = `${adminFinancePath}/${restaurant.id}`;
    const [paymentResponse, adjustmentResponse] = await Promise.all([
      finance.request("POST", `${restaurantPath}/payments`, payment),
      superAdmin.request("POST", `${restaurantPath}/adjustments`, adjustment),
    ]);
    expect(paymentResponse.statusCode).toBe(201);
    expect(adjustmentResponse.statusCode).toBe(201);
    const savedPayment = ledgerEntrySchema.parse(paymentResponse.json());
    const savedAdjustment = ledgerEntrySchema.parse(adjustmentResponse.json());
    expect(savedPayment).toMatchObject({
      ...payment,
      amountMinor: -10_000,
      type: "PAYMENT_RECEIVED",
      orderId: null,
    });
    expect(savedAdjustment).toMatchObject({
      ...adjustment,
      type: "ADJUSTMENT",
      orderId: null,
    });

    const [
      balanceResponse,
      adminLedgerResponse,
      ownerLedgerResponse,
      otherLedger,
    ] = await Promise.all([
      finance.request("GET", adminFinancePath),
      superAdmin.request("GET", `${restaurantPath}/ledger`),
      owner("GET", ownerLedgerPath),
      otherOwner("GET", `${ownerLedgerPath}?restaurantId=${restaurant.id}`),
    ]);
    for (const result of [
      balanceResponse,
      adminLedgerResponse,
      ownerLedgerResponse,
      otherLedger,
    ]) {
      expect(result.statusCode).toBe(200);
    }
    const { restaurants } = restaurantBalancesResponseSchema.parse(
      balanceResponse.json(),
    );
    expect(restaurants).toEqual(
      expect.arrayContaining([
        {
          restaurantId: restaurant.id,
          name: restaurant.name,
          balanceMinor: 12_000,
        },
        {
          restaurantId: emptyRestaurant.id,
          name: emptyRestaurant.name,
          balanceMinor: 0,
        },
      ]),
    );
    const adminLedger = financeLedgerResponseSchema.parse(
      adminLedgerResponse.json(),
    );
    expect(
      financeLedgerResponseSchema.parse(ownerLedgerResponse.json()),
    ).toEqual(adminLedger);
    expect(financeLedgerResponseSchema.parse(otherLedger.json())).toMatchObject(
      {
        restaurantId: emptyRestaurant.id,
        entries: [],
      },
    );
    const { entries } = adminLedger;
    expect(entries).toHaveLength(5);
    expect(entries.filter(({ type }) => type === "COMMISSION_ACCRUED")).toEqual(
      expect.arrayContaining(
        orders.map(({ orderId, expectedCommissionMinor }) =>
          expect.objectContaining({
            orderId,
            amountMinor: expectedCommissionMinor,
          }),
        ),
      ),
    );
    expect(entries.reduce((sum, { amountMinor }) => sum + amountMinor, 0)).toBe(
      12_000,
    );

    const audits = await test.db.auditLog.findMany({
      where: {
        entityType: "LedgerEntry",
        entityId: { in: [savedPayment.id, savedAdjustment.id] },
      },
    });
    expect(audits).toHaveLength(2);
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          adminUserId: finance.id,
          action: "LEDGER_PAYMENT_CREATE",
          entityId: savedPayment.id,
          after: expect.objectContaining({
            restaurantId: restaurant.id,
            amountMinor: -10_000,
          }),
        }),
        expect.objectContaining({
          adminUserId: superAdmin.id,
          action: "LEDGER_ADJUSTMENT_CREATE",
          entityId: savedAdjustment.id,
          after: expect.objectContaining({
            restaurantId: restaurant.id,
            amountMinor: -1_333,
          }),
        }),
      ]),
    );
  } finally {
    await test.api.close();
  }
}, 30_000);

it("validates append-only ledger inputs and enforces finance roles on reads and writes", async () => {
  const test = openAuthTest();
  try {
    const [restaurant, finance, superAdmin, operations, support] =
      await Promise.all([
        test.db.restaurant.create({ data: { commissionRateBps } }),
        admin(test, "FINANCE"),
        admin(test, "SUPER_ADMIN"),
        admin(test, "OPERATIONS"),
        admin(test, "SUPPORT"),
      ]);
    const restaurantPath = `${adminFinancePath}/${restaurant.id}`;
    const ledgerPath = `${restaurantPath}/ledger`;
    const paymentsPath = `${restaurantPath}/payments`;
    const adjustmentsPath = `${restaurantPath}/adjustments`;
    const [manager, cashier, kitchen] = await Promise.all(
      (["MANAGER", "CASHIER", "KITCHEN"] as const).map((role) =>
        restaurantUser(test, restaurant.id, role),
      ),
    );
    if (!manager || !cashier || !kitchen)
      throw new Error("Could not create restaurant users.");
    const forbidden = await Promise.all([
      ...[operations, support].flatMap(({ request }) => [
        request("GET", adminFinancePath),
        request("GET", ledgerPath),
        request("POST", paymentsPath, payment),
        request("POST", adjustmentsPath, adjustment),
      ]),
      ...[manager, cashier, kitchen].map((request) =>
        request("GET", ownerLedgerPath),
      ),
      manager("GET", ledgerPath),
      finance.request("GET", ownerLedgerPath),
    ]);
    for (const response of forbidden) {
      expect(response.statusCode).toBe(403);
      expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe(
        "FORBIDDEN",
      );
    }
    const invalid = await Promise.all([
      finance.request("POST", adjustmentsPath, { amountMinor: -100 }),
      finance.request("POST", adjustmentsPath, { ...adjustment, reason: "  " }),
      finance.request("POST", adjustmentsPath, {
        ...adjustment,
        amountMinor: 1.25,
      }),
      finance.request("POST", adjustmentsPath, {
        ...adjustment,
        orderId: randomUUID(),
      }),
      superAdmin.request("POST", paymentsPath, {
        ...payment,
        amountMinor: -10,
      }),
      superAdmin.request("POST", paymentsPath, {
        ...payment,
        paymentDate: "2026-02-30",
      }),
    ]);
    for (const response of invalid) {
      expect(response.statusCode).toBe(400);
      expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe(
        "VALIDATION_ERROR",
      );
    }
    const missing = await finance.request(
      "GET",
      `${adminFinancePath}/${randomUUID()}/ledger`,
    );
    expect(missing.statusCode).toBe(404);
    expect(
      await test.db.ledgerEntry.count({
        where: { restaurantId: restaurant.id },
      }),
    ).toBe(0);
    expect(
      await test.db.auditLog.count({
        where: { adminUserId: { in: [finance.id, superAdmin.id] } },
      }),
    ).toBe(0);

    const positiveAdjustment = await finance.request("POST", adjustmentsPath, {
      ...adjustment,
      amountMinor: 20,
    });
    const excessPayment = await superAdmin.request("POST", paymentsPath, {
      ...payment,
      amountMinor: 50,
    });
    expect(positiveAdjustment.statusCode).toBe(201);
    expect(excessPayment.statusCode).toBe(201);
    const { restaurants } = restaurantBalancesResponseSchema.parse(
      (await finance.request("GET", adminFinancePath)).json(),
    );
    expect(
      restaurants.find(({ restaurantId }) => restaurantId === restaurant.id)
        ?.balanceMinor,
    ).toBe(-30);
  } finally {
    await test.api.close();
  }
}, 30_000);
