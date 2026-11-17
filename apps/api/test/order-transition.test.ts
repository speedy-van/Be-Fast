import { randomInt, randomUUID } from "node:crypto";
import type { OrderReadResponse } from "@be-fast/contracts";
import {
  ORDER_STATUSES,
  ORDER_TYPES,
  canTargetStatus,
  canTransition,
  type OrderStatus,
  type OrderType,
} from "@be-fast/domain";
import type { Principal } from "../src/auth/tokens.js";
import type { RestaurantRole } from "../src/generated/prisma/enums.ts";
import {
  transitionOrder,
  type TransitionActor,
} from "../src/orders/transition.js";
import { describe, expect, it } from "vitest";
import { openAuthTest } from "./auth-test-support.js";

type Test = ReturnType<typeof openAuthTest>;
const integrationTimeout = 30_000;

async function setup(test: Test) {
  const restaurant = await test.db.restaurant.create({
    data: { commissionRateBps: 1_000 },
  });
  const branch = await test.db.branch.create({
    data: { restaurantId: restaurant.id },
  });
  const customer = await test.db.customer.create({
    data: { name: "Fixture customer" },
  });
  return {
    restaurantId: restaurant.id,
    branchId: branch.id,
    customerId: customer.id,
  };
}

async function restaurantUser(
  test: Test,
  restaurantId: string,
  role: RestaurantRole,
) {
  const account = await test.db.restaurantUser.create({
    data: {
      restaurantId,
      role,
      phone: `+9639${String(randomInt(100_000_000)).padStart(8, "0")}`,
      passwordHash: "fixture",
    },
  });
  const { accessToken } = await test.tokens.issue({
    aud: "restaurant",
    sub: account.id,
    restaurantId,
    role,
  });
  return { id: account.id, accessToken };
}

async function adminUser(
  test: Test,
  role: Extract<Principal, { aud: "admin" }>["role"],
) {
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
  return { id: user.id, accessToken };
}

function orderData(
  test: Test,
  record: Awaited<ReturnType<typeof setup>>,
  status: OrderStatus,
  type: OrderType = "DELIVERY",
) {
  return {
    id: randomUUID(),
    orderNumber: `Fixture-${randomUUID()}`,
    idempotencyKey: randomUUID(),
    branchId: record.branchId,
    customerId: record.customerId,
    customerName: "Fixture customer",
    status,
    type,
    foodSubtotalMinor: 80_000n,
    deliveryFeeMinor: type === "DELIVERY" ? 10_000n : 0n,
    totalMinor: type === "DELIVERY" ? 90_000n : 80_000n,
    commissionRateBps: 1_000,
    commissionMinor: 8_000n,
    etaMinutes: type === "DELIVERY" ? 25 : null,
    createdAt: new Date(test.clock.now.getTime() - 600_000),
    needsAttention: status === "PENDING",
  };
}

function post(test: Test, accessToken: string, url: string, payload?: object) {
  return test.api.inject({
    method: "POST",
    url,
    payload,
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

function restaurantTransition(
  test: Test,
  accessToken: string,
  id: string,
  payload: object,
) {
  return post(
    test,
    accessToken,
    `/restaurant/orders/${id}/transition`,
    payload,
  );
}

describe("persistent order transitions", () => {
  it(
    "accrues the captured commission and allows an authorized replay without another event, ledger entry or notification",
    async () => {
      const notifications: OrderStatus[] = [];
      const test = openAuthTest({
        push: {
          async newOrder() {},
          async orderReminder() {},
          async orderStatusChanged(_customerId, _orderId, status) {
            notifications.push(status);
          },
        },
      });
      try {
        const fixture = await setup(test);
        const owner = await restaurantUser(test, fixture.restaurantId, "OWNER");
        const cashier = await restaurantUser(
          test,
          fixture.restaurantId,
          "CASHIER",
        );
        const kitchen = await restaurantUser(
          test,
          fixture.restaurantId,
          "KITCHEN",
        );
        const order = await test.db.order.create({
          data: orderData(test, fixture, "OUT_FOR_DELIVERY"),
        });
        await test.db.restaurant.update({
          where: { id: fixture.restaurantId },
          data: { commissionRateBps: 4_000 },
        });

        const delivered = await restaurantTransition(
          test,
          owner.accessToken,
          order.id,
          { to: "DELIVERED" },
        );
        expect(delivered.statusCode, delivered.body).toBe(200);
        expect(delivered.json()).toMatchObject({
          id: order.id,
          status: "DELIVERED",
          commissionRateBps: 1_000,
          commissionMinor: 8_000,
        });
        const denied = await restaurantTransition(
          test,
          kitchen.accessToken,
          order.id,
          { to: "DELIVERED" },
        );
        expect(denied.statusCode).toBe(403);
        const repeated = await restaurantTransition(
          test,
          cashier.accessToken,
          order.id,
          { to: "DELIVERED" },
        );
        expect(repeated.statusCode).toBe(200);
        expect(repeated.json()).toMatchObject({
          id: order.id,
          status: "DELIVERED",
          events: delivered.json<OrderReadResponse>().events,
        });
        expect(repeated.json()).not.toHaveProperty("commissionMinor");
        expect(notifications).toEqual(["DELIVERED"]);
        expect(
          await test.db.orderStatusEvent.findMany({
            where: { orderId: order.id },
          }),
        ).toEqual([
          expect.objectContaining({
            from: "OUT_FOR_DELIVERY",
            to: "DELIVERED",
            actorType: "RESTAURANT",
            actorId: owner.id,
          }),
        ]);
        expect(
          await test.db.ledgerEntry.findMany({ where: { orderId: order.id } }),
        ).toEqual([
          expect.objectContaining({
            restaurantId: fixture.restaurantId,
            type: "COMMISSION_ACCRUED",
            amountMinor: 8_000n,
          }),
        ]);
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "keeps exactly one event and commission across simultaneous delivery requests",
    async () => {
      const test = openAuthTest();
      try {
        const fixture = await setup(test);
        const user = await restaurantUser(test, fixture.restaurantId, "OWNER");
        const order = await test.db.order.create({
          data: orderData(test, fixture, "READY", "PICKUP"),
        });
        const results = await Promise.all(
          [1, 2].map(() =>
            restaurantTransition(test, user.accessToken, order.id, {
              to: "DELIVERED",
            }),
          ),
        );
        expect(results.map(({ statusCode }) => statusCode)).toContain(200);
        expect(
          results.every(
            ({ statusCode }) => statusCode === 200 || statusCode === 409,
          ),
        ).toBe(true);
        expect(
          await test.db.orderStatusEvent.count({
            where: { orderId: order.id, to: "DELIVERED" },
          }),
        ).toBe(1);
        expect(
          await test.db.ledgerEntry.count({
            where: { orderId: order.id, type: "COMMISSION_ACCRUED" },
          }),
        ).toBe(1);
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "permits only one of concurrent accept and reject transitions",
    async () => {
      const test = openAuthTest();
      try {
        const fixture = await setup(test);
        const owner = await restaurantUser(test, fixture.restaurantId, "OWNER");
        const order = await test.db.order.create({
          data: orderData(test, fixture, "PENDING"),
        });
        const [accepted, rejected] = await Promise.all([
          restaurantTransition(test, owner.accessToken, order.id, {
            to: "ACCEPTED",
            prepMinutes: 20,
          }),
          restaurantTransition(test, owner.accessToken, order.id, {
            to: "REJECTED",
            reasonCode: "TOO_BUSY",
          }),
        ]);
        expect([accepted.statusCode, rejected.statusCode].sort()).toEqual([
          200, 409,
        ]);
        const failed = accepted.statusCode === 409 ? accepted : rejected;
        expect(failed.json()).toMatchObject({
          error: { code: "INVALID_TRANSITION" },
        });
        const events = await test.db.orderStatusEvent.findMany({
          where: { orderId: order.id },
        });
        const saved = await test.db.order.findUniqueOrThrow({
          where: { id: order.id },
        });
        expect(events).toEqual([
          expect.objectContaining({ from: "PENDING", to: saved.status }),
        ]);
        expect(saved.needsAttention).toBe(false);
        if (saved.status === "ACCEPTED") {
          expect(saved.estimatedReadyAt).toEqual(
            new Date(test.clock.now.getTime() + 20 * 60_000),
          );
          expect(saved.estimatedDeliveryAt).toEqual(
            new Date(test.clock.now.getTime() + 45 * 60_000),
          );
        } else {
          expect(saved.commissionMinor).toBe(0n);
        }
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "makes no commission for rejected, expired, canceled, or failed deliveries",
    async () => {
      const test = openAuthTest();
      try {
        const fixture = await setup(test);
        const owner = await restaurantUser(test, fixture.restaurantId, "OWNER");
        const customer = await test.tokens.issue({
          aud: "customer",
          sub: fixture.customerId,
        });
        const rejected = await test.db.order.create({
          data: orderData(test, fixture, "PENDING"),
        });
        const expired = await test.db.order.create({
          data: orderData(test, fixture, "PENDING"),
        });
        const canceled = await test.db.order.create({
          data: orderData(test, fixture, "PENDING"),
        });
        const failed = await test.db.order.create({
          data: orderData(test, fixture, "OUT_FOR_DELIVERY"),
        });
        const rejectedResponse = await restaurantTransition(
          test,
          owner.accessToken,
          rejected.id,
          { to: "REJECTED", reasonCode: "ITEM_UNAVAILABLE" },
        );
        expect(rejectedResponse.statusCode).toBe(200);
        expect(
          await transitionOrder(test.db, {
            id: expired.id,
            to: "EXPIRED",
            actor: { type: "SYSTEM" },
            now: test.clock.now,
            expiresAtOrBefore: new Date(test.clock.now.getTime() - 480_000),
          }),
        ).toMatchObject({ status: "EXPIRED", changed: true });
        expect(
          (
            await post(
              test,
              customer.accessToken,
              `/customer/orders/${canceled.id}/cancel`,
            )
          ).statusCode,
        ).toBe(200);
        expect(
          (
            await restaurantTransition(test, owner.accessToken, failed.id, {
              to: "DELIVERY_FAILED",
              reasonCode: "CUSTOMER_UNREACHABLE",
            })
          ).statusCode,
        ).toBe(200);
        const ids = [rejected.id, expired.id, canceled.id, failed.id];
        expect(
          await test.db.ledgerEntry.count({ where: { orderId: { in: ids } } }),
        ).toBe(0);
        const saved = await test.db.order.findMany({
          where: { id: { in: ids } },
        });
        expect(saved.map(({ status }) => status).sort()).toEqual([
          "CANCELLED",
          "DELIVERY_FAILED",
          "EXPIRED",
          "REJECTED",
        ]);
        expect(
          saved.every(
            ({ commissionMinor, finishedAt }) =>
              commissionMinor === 0n && finishedAt !== null,
          ),
        ).toBe(true);
        expect(
          (
            await restaurantTransition(test, owner.accessToken, rejected.id, {
              to: "DELIVERED",
            })
          ).statusCode,
        ).toBe(409);
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "enforces ownership before target permission and writes one audit row for an authorized admin cancel",
    async () => {
      const test = openAuthTest();
      try {
        const fixture = await setup(test);
        const other = await setup(test);
        const unauthorizedRestaurant = await restaurantUser(
          test,
          other.restaurantId,
          "KITCHEN",
        );
        const unauthorizedCustomer = await test.tokens.issue({
          aud: "customer",
          sub: other.customerId,
        });
        const ops = await adminUser(test, "OPERATIONS");
        const support = await adminUser(test, "SUPPORT");
        const order = await test.db.order.create({
          data: orderData(test, fixture, "OUT_FOR_DELIVERY"),
        });
        expect(
          (
            await restaurantTransition(
              test,
              unauthorizedRestaurant.accessToken,
              order.id,
              { to: "DELIVERED" },
            )
          ).statusCode,
        ).toBe(404);
        expect(
          (
            await post(
              test,
              unauthorizedCustomer.accessToken,
              `/customer/orders/${order.id}/cancel`,
            )
          ).statusCode,
        ).toBe(404);
        const url = `/admin/orders/${order.id}/cancel`;
        expect(
          (
            await post(test, support.accessToken, url, {
              reasonCode: "CUSTOMER_REQUEST",
            })
          ).statusCode,
        ).toBe(403);
        expect((await post(test, ops.accessToken, url)).statusCode).toBe(400);
        expect(
          (await post(test, ops.accessToken, url, { reasonCode: "TOO_BUSY" }))
            .statusCode,
        ).toBe(400);
        expect(
          (
            await post(test, ops.accessToken, url, {
              reasonCode: "CUSTOMER_REQUEST",
            })
          ).statusCode,
        ).toBe(200);
        expect((await post(test, ops.accessToken, url)).statusCode).toBe(200);
        expect(
          await test.db.auditLog.findMany({
            where: { entityType: "Order", entityId: order.id },
          }),
        ).toEqual([
          expect.objectContaining({
            action: "ORDER_CANCEL",
            adminUserId: ops.id,
            before: { status: "OUT_FOR_DELIVERY" },
            after: { status: "CANCELLED", reasonCode: "CUSTOMER_REQUEST" },
          }),
        ]);
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "validates prep time for acceptance but does not require it again on replay",
    async () => {
      const test = openAuthTest();
      try {
        const fixture = await setup(test);
        const actor = await restaurantUser(test, fixture.restaurantId, "OWNER");
        const order = await test.db.order.create({
          data: orderData(test, fixture, "PENDING", "PICKUP"),
        });
        for (const prepMinutes of [undefined, 4, 181]) {
          expect(
            (
              await restaurantTransition(test, actor.accessToken, order.id, {
                to: "ACCEPTED",
                prepMinutes,
              })
            ).statusCode,
          ).toBe(400);
        }
        expect(
          (
            await restaurantTransition(test, actor.accessToken, order.id, {
              to: "ACCEPTED",
              prepMinutes: 5,
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (
            await restaurantTransition(test, actor.accessToken, order.id, {
              to: "ACCEPTED",
            })
          ).statusCode,
        ).toBe(200);
        const saved = await test.db.order.findUniqueOrThrow({
          where: { id: order.id },
        });
        expect(saved).toMatchObject({
          prepMinutes: 5,
          acceptedAt: test.clock.now,
          estimatedReadyAt: new Date(test.clock.now.getTime() + 5 * 60_000),
          estimatedDeliveryAt: null,
        });
        expect(
          await test.db.orderStatusEvent.count({
            where: { orderId: order.id },
          }),
        ).toBe(1);

        const delivery = await test.db.order.create({
          data: orderData(test, fixture, "PENDING"),
        });
        expect(
          (
            await restaurantTransition(test, actor.accessToken, delivery.id, {
              to: "ACCEPTED",
              prepMinutes: 23,
            })
          ).statusCode,
        ).toBe(200);
        expect(
          await test.db.order.findUniqueOrThrow({ where: { id: delivery.id } }),
        ).toMatchObject({
          estimatedReadyAt: new Date(test.clock.now.getTime() + 23 * 60_000),
          estimatedDeliveryAt: new Date(test.clock.now.getTime() + 48 * 60_000),
        });
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it("returns INVALID_TRANSITION for domain-generated invalid state pairs after target eligibility", async () => {
    const test = openAuthTest();
    try {
      const fixture = await setup(test);
      const owner = await restaurantUser(test, fixture.restaurantId, "OWNER");
      const admin = await adminUser(test, "OPERATIONS");
      const actors: TransitionActor[] = [
        {
          type: "RESTAURANT",
          id: owner.id,
          restaurantId: fixture.restaurantId,
          role: "OWNER",
        },
        {
          type: "ADMIN",
          id: admin.id,
          role: "OPERATIONS",
          async audit() {
            throw new Error("Unexpected audit.");
          },
        },
        { type: "CUSTOMER", id: fixture.customerId },
        { type: "SYSTEM" },
      ];
      const orders = ORDER_TYPES.flatMap((type) =>
        ORDER_STATUSES.map((status) => orderData(test, fixture, status, type)),
      );
      await test.db.order.createMany({ data: orders });
      const invalidCases = orders.flatMap(({ id, status, type }) =>
        ORDER_STATUSES.flatMap((to) =>
          actors
            .filter(
              (actor) =>
                status !== to &&
                canTargetStatus(to, actor, type) &&
                !canTransition(status, to, actor, type),
            )
            .map((actor) => ({ id, to, actor, status, type })),
        ),
      );
      expect(invalidCases.length).toBeGreaterThan(100);
      const batchSize = 6;
      for (let offset = 0; offset < invalidCases.length; offset += batchSize) {
        await Promise.all(
          invalidCases
            .slice(offset, offset + batchSize)
            .map(({ id, to, actor, status, type }) =>
              expect(
                transitionOrder(test.db, {
                  id,
                  to,
                  actor,
                  now: test.clock.now,
                }),
                `${actor.type} ${type} ${status} -> ${to}`,
              ).rejects.toMatchObject({
                statusCode: 409,
                code: "INVALID_TRANSITION",
              }),
            ),
        );
      }
      expect(
        await test.db.orderStatusEvent.count({
          where: { orderId: { in: orders.map(({ id }) => id) } },
        }),
      ).toBe(0);
    } finally {
      await test.api.close();
    }
  }, 90_000);
});
