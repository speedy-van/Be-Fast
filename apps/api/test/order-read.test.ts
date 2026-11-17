import {
  adminComplaintSchema,
  adminComplaintListSchema,
  customerComplaintResponseSchema,
  orderListResponseSchema,
  orderReadSchema,
} from "@be-fast/contracts";
import { describe, expect, it } from "vitest";
import type {
  AdminRole,
  OrderStatus,
  RestaurantRole,
} from "../src/generated/prisma/enums.ts";
import { openAuthTest } from "./auth-test-support.js";

type OrderTest = ReturnType<typeof openAuthTest>;
const integrationTimeoutMs = 40_000;
const customerPhone = "+963956920001";
const customerAddress = {
  street: "Fixture street",
  landmark: "Fixture landmark",
};
let nextFixture = 0;

async function withOrderTest(run: (test: OrderTest) => Promise<void>) {
  const test = openAuthTest();
  try {
    await run(test);
  } finally {
    await test.api.close();
  }
}

function auth(accessToken: string) {
  return { authorization: `Bearer ${accessToken}` };
}

async function createCustomer({ db, tokens }: OrderTest) {
  const customer = await db.customer.create({
    data: { name: "Fixture customer" },
  });
  const { accessToken } = await tokens.issue({
    aud: "customer",
    sub: customer.id,
  });
  return { ...customer, headers: auth(accessToken) };
}

async function createRestaurantUser(
  { db, tokens }: OrderTest,
  restaurantId: string,
  role: RestaurantRole,
) {
  const user = await db.restaurantUser.create({
    data: {
      restaurantId,
      phone: `+963${956920100 + ++nextFixture}`,
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
  return { ...user, headers: auth(accessToken) };
}

async function createAdmin({ db, tokens }: OrderTest, role: AdminRole) {
  const admin = await db.adminUser.create({
    data: {
      email: `order-read-${++nextFixture}@example.invalid`,
      passwordHash: "Fixture",
      totpSecret: "Fixture",
      role,
    },
  });
  const { accessToken } = await tokens.issue({
    aud: "admin",
    sub: admin.id,
    role,
  });
  return { ...admin, headers: auth(accessToken) };
}

async function createOrder(
  test: OrderTest,
  status: OrderStatus = "PENDING",
  finishedAt?: Date,
  needsAttention = false,
) {
  const { db, clock } = test;
  const customer = await createCustomer(test);
  const branch = await db.branch.create({
    data: {
      restaurant: {
        create: {
          name: "Fixture kitchen",
          contactPhone: "+963956920900",
          status: "APPROVED",
          commissionRateBps: 1000,
        },
      },
    },
  });
  const item = await db.menuItem.create({
    data: {
      section: { create: { restaurantId: branch.restaurantId, name: "Menu" } },
      name: "Live item",
      sizes: { create: { name: "Live size", priceMinor: 30_000n } },
      optionGroups: {
        create: {
          name: "Option group",
          minSelect: 1,
          maxSelect: 1,
          options: { create: { name: "Live option", priceMinor: 2500n } },
        },
      },
    },
    include: { sizes: true, optionGroups: { include: { options: true } } },
  });
  const size = item.sizes[0];
  const choice = item.optionGroups[0]?.options[0];
  if (!size || !choice) throw new Error("Expected fixture menu choices.");
  const key = String(++nextFixture).padStart(12, "0");
  const order = await db.order.create({
    data: {
      branchId: branch.id,
      customerId: customer.id,
      orderNumber: `BF-${712000 + nextFixture}`,
      idempotencyKey: `00000000-0000-4000-8000-${key}`,
      type: "DELIVERY",
      status,
      createdAt: clock.now,
      customerName: "Snapshot customer",
      customerPhone,
      addressSnapshot: customerAddress,
      finishedAt,
      needsAttention,
      foodSubtotalMinor: 32_500n,
      deliveryFeeMinor: 3000n,
      totalMinor: 35_500n,
      commissionRateBps: 1000,
      commissionMinor: 3250n,
      items: {
        create: {
          menuItemId: item.id,
          sizeId: size.id,
          name: "Snapshot meal",
          sizeName: "Snapshot size",
          unitPriceMinor: 32_500n,
          totalMinor: 32_500n,
          quantity: 1,
          options: {
            create: {
              optionId: choice.id,
              name: "Snapshot option",
              priceMinor: 2500n,
            },
          },
        },
      },
      statusEvents: {
        create: {
          id: `ffffffff-ffff-4fff-bfff-${key}`,
          to: "PENDING",
          actorType: "CUSTOMER",
          actorId: customer.id,
          createdAt: clock.now,
        },
      },
    },
  });
  return { order, customer, branch };
}

function keysDeep(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysDeep);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    key,
    ...keysDeep(child),
  ]);
}

describe("order reads", () => {
  it(
    "keeps lifecycle order when the initial event and acceptance share a timestamp",
    () =>
      withOrderTest(async (test) => {
        const setup = await createOrder(test);
        await test.db.order.update({
          where: { id: setup.order.id },
          data: { status: "ACCEPTED" },
        });
        await test.db.orderStatusEvent.create({
          data: {
            id: "00000000-0000-4000-8000-000000000072",
            orderId: setup.order.id,
            from: "PENDING",
            to: "ACCEPTED",
            actorType: "RESTAURANT",
            createdAt: test.clock.now,
          },
        });
        const response = await test.api.inject({
          method: "GET",
          url: `/customer/orders/${setup.order.id}`,
          headers: setup.customer.headers,
        });
        expect(response.statusCode).toBe(200);
        expect(
          orderReadSchema.parse(response.json()).events.map(({ to }) => to),
        ).toEqual(["PENDING", "ACCEPTED"]);
      }),
    integrationTimeoutMs,
  );

  it(
    "restricts customer and restaurant order access to the principals' own rows",
    () =>
      withOrderTest(async (test) => {
        const first = await createOrder(test);
        const second = await createOrder(test);
        const owner = await createRestaurantUser(
          test,
          first.branch.restaurantId,
          "OWNER",
        );
        for (const [url, headers] of [
          [`/customer/orders/${second.order.id}`, first.customer.headers],
          [`/restaurant/orders/${second.order.id}`, owner.headers],
        ] as const) {
          const response = await test.api.inject({
            method: "GET",
            url,
            headers,
          });
          expect(response.statusCode).toBe(404);
          expect(response.json().error.code).toBe("NOT_FOUND");
        }

        for (const [url, headers] of [
          ["/customer/orders", first.customer.headers],
          ["/restaurant/orders?status=PENDING", owner.headers],
        ] as const) {
          const response = await test.api.inject({
            method: "GET",
            url,
            headers,
          });
          expect(response.statusCode).toBe(200);
          const { orders } = orderListResponseSchema.parse(response.json());
          expect(orders.map(({ id }) => id)).toEqual([first.order.id]);
          expect(orders[0]?.commissionMinor).toBe(
            url.startsWith("/restaurant/") ? 0 : undefined,
          );
          expect(orders[0]).toMatchObject({
            items: [
              {
                name: "Snapshot meal",
                sizeName: "Snapshot size",
                options: [{ name: "Snapshot option" }],
              },
            ],
            events: [{ to: "PENDING" }],
          });
        }
      }),
    integrationTimeoutMs,
  );

  it(
    "omits every structured amount and contact from kitchen views and records active polling",
    () =>
      withOrderTest(async (test) => {
        const setup = await createOrder(test);
        const kitchen = await createRestaurantUser(
          test,
          setup.branch.restaurantId,
          "KITCHEN",
        );
        for (const url of [
          "/restaurant/orders/active",
          "/restaurant/orders",
          `/restaurant/orders/${setup.order.id}`,
        ]) {
          const response = await test.api.inject({
            method: "GET",
            url,
            headers: kitchen.headers,
          });
          expect(response.statusCode).toBe(200);
          const body: unknown = response.json();
          const parsed = url.endsWith(setup.order.id)
            ? orderReadSchema.parse(body)
            : orderListResponseSchema.parse(body).orders[0];
          expect(parsed).toMatchObject({
            id: setup.order.id,
            customerName: "Snapshot customer",
            items: [
              { name: "Snapshot meal", options: [{ name: "Snapshot option" }] },
            ],
          });
          expect(
            keysDeep(body).filter((key) =>
              /phone|address|minor|commission/iu.test(key),
            ),
          ).toEqual([]);
        }
        const branch = await test.db.branch.findUniqueOrThrow({
          where: { id: setup.branch.id },
        });
        expect(branch.lastSeenAt?.toISOString()).toBe(
          test.clock.now.toISOString(),
        );
      }),
    integrationTimeoutMs,
  );

  it(
    "hides the name and address and masks the phone at the exact 24-hour terminal boundary",
    () =>
      withOrderTest(async (test) => {
        const finishedAt = new Date(
          test.clock.now.getTime() - 24 * 60 * 60 * 1000 + 1,
        );
        const setup = await createOrder(test, "DELIVERED", finishedAt);
        const owner = await createRestaurantUser(
          test,
          setup.branch.restaurantId,
          "OWNER",
        );
        const support = await createAdmin(test, "SUPPORT");
        const restaurantUrl = `/restaurant/orders/${setup.order.id}`;
        const before = await test.api.inject({
          method: "GET",
          url: restaurantUrl,
          headers: owner.headers,
        });
        expect(before.statusCode).toBe(200);
        expect(orderReadSchema.parse(before.json())).toMatchObject({
          customerName: "Snapshot customer",
          customerPhone,
          addressSnapshot: customerAddress,
          commissionMinor: 3250,
        });

        test.clock.now = new Date(test.clock.now.getTime() + 1);
        const after = await test.api.inject({
          method: "GET",
          url: restaurantUrl,
          headers: owner.headers,
        });
        expect(after.statusCode).toBe(200);
        expect(orderReadSchema.parse(after.json())).toMatchObject({
          customerName: null,
          customerPhone: "+9639••••••01",
          addressSnapshot: null,
        });

        const admin = await test.api.inject({
          method: "GET",
          url: `/admin/orders/${setup.order.id}`,
          headers: support.headers,
        });
        expect(admin.statusCode).toBe(200);
        const detail = orderReadSchema.parse(admin.json());
        expect(detail).toMatchObject({
          customerId: setup.customer.id,
          customerName: "Snapshot customer",
          customerPhone,
          addressSnapshot: customerAddress,
          events: [{ actorId: setup.customer.id }],
        });
        expect(detail.commissionMinor).toBeUndefined();
      }),
    integrationTimeoutMs,
  );

  it(
    "returns only still-pending flagged orders in the admin attention list",
    () =>
      withOrderTest(async (test) => {
        const pending = await createOrder(test, "PENDING", undefined, true);
        const resolved = await createOrder(
          test,
          "DELIVERED",
          test.clock.now,
          true,
        );
        const support = await createAdmin(test, "SUPPORT");
        const finance = await createAdmin(test, "FINANCE");
        const url = "/admin/orders/needs-attention";
        const response = await test.api.inject({
          method: "GET",
          url,
          headers: support.headers,
        });
        expect(response.statusCode).toBe(200);
        const ids = orderListResponseSchema
          .parse(response.json())
          .orders.map(({ id }) => id);
        expect(ids).toContain(pending.order.id);
        expect(ids).not.toContain(resolved.order.id);
        const active = await test.api.inject({
          url: "/admin/orders?active=true",
          headers: support.headers,
        });
        expect(active.statusCode).toBe(200);
        const activeIds = orderListResponseSchema
          .parse(active.json())
          .orders.map(({ id }) => id);
        expect(activeIds).toContain(pending.order.id);
        expect(activeIds).not.toContain(resolved.order.id);
        expect(
          (
            await test.api.inject({
              method: "GET",
              url,
              headers: finance.headers,
            })
          ).statusCode,
        ).toBe(403);
      }),
    integrationTimeoutMs,
  );
});

describe("order complaints", () => {
  it(
    "accepts only one open complaint per owned order even with concurrent submissions",
    () =>
      withOrderTest(async (test) => {
        const setup = await createOrder(test);
        const other = await createCustomer(test);
        const url = `/customer/orders/${setup.order.id}/complaint`;
        const payload = { type: "OTHER", text: "Fixture complaint" };
        expect(
          (
            await test.api.inject({
              method: "POST",
              url,
              headers: other.headers,
              payload,
            })
          ).statusCode,
        ).toBe(404);
        expect(
          (
            await test.api.inject({
              method: "GET",
              url,
              headers: other.headers,
            })
          ).statusCode,
        ).toBe(404);
        const results = await Promise.all(
          [1, 2].map(() =>
            test.api.inject({
              method: "POST",
              url,
              headers: setup.customer.headers,
              payload,
            }),
          ),
        );
        expect(results.map(({ statusCode }) => statusCode).sort()).toEqual([
          201, 409,
        ]);
        expect(
          await test.db.complaint.count({ where: { orderId: setup.order.id } }),
        ).toBe(1);
        const fetched = await test.api.inject({
          method: "GET",
          url,
          headers: setup.customer.headers,
        });
        expect(fetched.statusCode).toBe(200);
        expect(
          customerComplaintResponseSchema.parse(fetched.json()).complaint,
        ).toMatchObject({ status: "OPEN", text: "Fixture complaint" });
      }),
    integrationTimeoutMs,
  );

  it(
    "records support verification and keeps non-delivery in progress without an adjustment",
    () =>
      withOrderTest(async (test) => {
        const setup = await createOrder(test, "DELIVERED", test.clock.now);
        const support = await createAdmin(test, "SUPPORT");
        const operations = await createAdmin(test, "OPERATIONS");
        const superAdmin = await createAdmin(test, "SUPER_ADMIN");
        const finance = await createAdmin(test, "FINANCE");
        const customerUrl = `/customer/orders/${setup.order.id}/complaint`;
        const created = await test.api.inject({
          method: "POST",
          url: customerUrl,
          headers: setup.customer.headers,
          payload: { type: "NOT_RECEIVED", text: "Fixture complaint" },
        });
        expect(created.statusCode).toBe(201);
        const { id } = created.json<{ id: string }>();
        const adminUrl = `/admin/complaints/${id}`;
        const review = {
          method: "PATCH" as const,
          url: adminUrl,
          payload: {
            verifyNonDelivery: true,
            internalNotes: "Private review note",
          },
        };
        expect(
          (await test.api.inject({ ...review, headers: finance.headers }))
            .statusCode,
        ).toBe(403);
        const verified = await test.api.inject({
          ...review,
          headers: support.headers,
        });
        expect(verified.statusCode).toBe(200);
        expect(adminComplaintSchema.parse(verified.json())).toMatchObject({
          status: "IN_PROGRESS",
          nonDeliveryVerifiedAt: test.clock.now.toISOString(),
          internalNotes: "Private review note",
        });
        const list = await test.api.inject({
          method: "GET",
          url: "/admin/complaints?status=IN_PROGRESS&type=NOT_RECEIVED",
          headers: operations.headers,
        });
        expect(list.statusCode).toBe(200);
        expect(adminComplaintListSchema.parse(list.json()).complaints).toEqual(
          expect.arrayContaining([expect.objectContaining({ id })]),
        );

        for (const reviewer of [support, operations, superAdmin]) {
          const close = await test.api.inject({
            method: "PATCH",
            url: adminUrl,
            headers: reviewer.headers,
            payload: { status: "RESOLVED" },
          });
          expect(close.statusCode).toBe(409);
        }
        const response = await test.api.inject({
          method: "GET",
          url: customerUrl,
          headers: setup.customer.headers,
        });
        expect(
          customerComplaintResponseSchema.parse(response.json()).complaint,
        ).toMatchObject({ status: "IN_PROGRESS" });
        const audit = await test.db.auditLog.findFirstOrThrow({
          where: { entityType: "Complaint", entityId: id },
        });
        expect(audit).toMatchObject({
          adminUserId: support.id,
          action: "COMPLAINT_VERIFY_NON_DELIVERY",
          after: {
            status: "IN_PROGRESS",
            nonDeliveryVerifiedAt: test.clock.now.toISOString(),
          },
        });
        expect(JSON.stringify(audit.after)).not.toContain(
          "Private review note",
        );
        expect(
          await test.db.ledgerEntry.count({
            where: { orderId: setup.order.id, type: "ADJUSTMENT" },
          }),
        ).toBe(0);
      }),
    integrationTimeoutMs,
  );
});
