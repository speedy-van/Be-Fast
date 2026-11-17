import { randomUUID } from "node:crypto";
import {
  authTokensSchema,
  errorEnvelopeSchema,
  orderListResponseSchema,
  orderReadSchema,
} from "@be-fast/contracts";
import { deletedCustomerName } from "@be-fast/i18n";
import { expect, it } from "vitest";
import type { OrderStatus } from "../src/generated/prisma/enums.ts";
import { readOrderTimings } from "../src/orders/settings.js";
import { openAuthTest } from "./auth-test-support.js";

type AccountTest = ReturnType<typeof openAuthTest>;
const integrationTimeout = 40_000;

it(
  "includes server-derived expiry metadata for a pending customer order",
  async () => {
    const test = openAuthTest();
    try {
      const { api, db, clock } = test;
      const { headers, createOrder } = await fixture(test, "+963998091127");
      const order = await createOrder("PENDING");
      const response = await api.inject({
        url: `/customer/orders/${order.id}`,
        headers,
      });
      const { expireAfterSec } = await readOrderTimings(db);
      expect(response.statusCode).toBe(200);
      expect(orderReadSchema.parse(response.json())).toMatchObject({
        serverTime: clock.now.toISOString(),
        pendingExpiresAt: new Date(
          order.createdAt.getTime() + expireAfterSec * 1_000,
        ).toISOString(),
      });
    } finally {
      await test.api.close();
    }
  },
  integrationTimeout,
);

const authorization = (accessToken: string) => ({
  authorization: `Bearer ${accessToken}`,
});

async function createAccount(test: AccountTest, phone: string) {
  const customer = await test.db.customer.create({
    data: { name: `Recorded name ${randomUUID()}`, phone },
  });
  const pair = await test.tokens.issue({ aud: "customer", sub: customer.id });
  return { customer, pair, headers: authorization(pair.accessToken) };
}

async function fixture(test: AccountTest, phone: string) {
  const { db } = test;
  const [{ customer, headers, pair }, branch, neighborhood] = await Promise.all(
    [
      createAccount(test, phone),
      db.branch.create({
        data: {
          restaurant: {
            create: { name: "Fixture kitchen", commissionRateBps: 1_000 },
          },
        },
      }),
      db.neighborhood.create({
        data: {
          name: "Fixture district",
          city: {
            create: {
              name: "Fixture city",
              governorate: {
                create: { name: `Fixture governorate ${randomUUID()}` },
              },
            },
          },
        },
      }),
    ],
  );
  const geography = {
    neighborhoodId: neighborhood.id,
    neighborhoodName: "Fixture district",
    cityName: "Fixture city",
    governorateName: "Fixture governorate",
  };
  const detail = {
    street: "Detailed street",
    landmark: "Private landmark",
    building: "Private building",
    floor: "2",
    label: "Private label",
    notes: "Private instructions",
    latitude: 33.514,
    longitude: 36.277,
  };
  const [, menuItem] = await Promise.all([
    db.customerAddress.create({
      data: {
        customerId: customer.id,
        neighborhoodId: neighborhood.id,
        ...detail,
        isDefault: true,
      },
    }),
    db.menuItem.create({
      data: {
        name: "Live menu item",
        section: {
          create: {
            name: "Fixture section",
            restaurantId: branch.restaurantId,
          },
        },
        sizes: { create: { name: "Live size", priceMinor: 80_000n } },
      },
      include: { sizes: true },
    }),
  ]);
  const size = menuItem.sizes[0];
  if (!size) throw new Error("Expected restaurant menu fixture.");
  const sizeId = size.id;

  async function createOrder(status: OrderStatus, owner = customer) {
    return db.order.create({
      data: {
        idempotencyKey: randomUUID(),
        orderNumber: `Fixture-${randomUUID()}`,
        branchId: branch.id,
        customerId: owner.id,
        status,
        type: "DELIVERY",
        customerName: owner.name ?? "Fixture customer",
        customerPhone: owner.phone,
        addressSnapshot: { ...geography, ...detail },
        foodSubtotalMinor: 80_000n,
        deliveryFeeMinor: 10_000n,
        totalMinor: 90_000n,
        commissionRateBps: 1_000,
        commissionMinor: 8_000n,
        createdAt: test.clock.now,
        finishedAt: status === "DELIVERED" ? test.clock.now : undefined,
        items: {
          create: {
            menuItemId: menuItem.id,
            sizeId,
            name: "Recorded item",
            sizeName: "Recorded size",
            quantity: 1,
            unitPriceMinor: 80_000n,
            totalMinor: 80_000n,
          },
        },
        statusEvents: {
          create: {
            to: status,
            actorType: "SYSTEM",
            createdAt: test.clock.now,
          },
        },
        ledgerEntries:
          status === "DELIVERED"
            ? {
                create: {
                  restaurantId: branch.restaurantId,
                  type: "COMMISSION_ACCRUED",
                  amountMinor: 8_000n,
                },
              }
            : undefined,
      },
      include: { items: true, statusEvents: true, ledgerEntries: true },
    });
  }
  return { customer, pair, headers, createOrder, geography, branch };
}

it(
  "rejects deletion for active orders and keeps the whole account intact",
  async () => {
    const test = openAuthTest();
    try {
      const { api, db } = test;
      const { customer, headers, createOrder } = await fixture(
        test,
        "+963998091121",
      );
      const order = await createOrder("PREPARING");
      const rejected = await api.inject({
        method: "DELETE",
        url: "/customer/me",
        headers,
      });
      expect(rejected.statusCode).toBe(409);
      expect(errorEnvelopeSchema.parse(rejected.json()).error.code).toBe(
        "ACTIVE_ORDERS",
      );
      expect(
        await db.customer.findUniqueOrThrow({ where: { id: customer.id } }),
      ).toMatchObject({
        name: customer.name,
        phone: customer.phone,
        deletedAt: null,
      });
      expect(
        await db.customerAddress.count({ where: { customerId: customer.id } }),
      ).toBe(1);
      expect(
        await db.refreshToken.count({ where: { customerId: customer.id } }),
      ).toBe(1);
      const retained = await db.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(retained.customerName).toBe(customer.name);
      expect(retained.status).toBe("PREPARING");
      expect(
        (await api.inject({ url: "/customer/me", headers })).statusCode,
      ).toBe(200);
    } finally {
      await test.api.close();
    }
  },
  integrationTimeout,
);

it(
  "anonymizes stored snapshots and revokes the previous identity while preserving business records",
  async () => {
    const test = openAuthTest();
    try {
      const { api, db, tokens, clock, otpCodes } = test;
      const phone = "+963998091122";
      const { customer, pair, headers, createOrder, geography, branch } =
        await fixture(test, phone);
      const [order, other, admin, staff] = await Promise.all([
        createOrder("DELIVERED"),
        createAccount(test, "+963998091123"),
        db.adminUser.create({
          data: {
            email: `${randomUUID()}@example.invalid`,
            passwordHash: "fixture",
            totpSecret: "fixture",
            role: "SUPER_ADMIN",
          },
        }),
        db.restaurantUser.create({
          data: {
            phone: "+963998091124",
            passwordHash: "fixture",
            restaurantId: branch.restaurantId,
            role: "OWNER",
          },
        }),
      ]);
      const otherOrder = await createOrder("PENDING", other.customer);
      const [adminToken, staffToken] = await Promise.all([
        tokens.issue({ aud: "admin", sub: admin.id, role: "SUPER_ADMIN" }),
        tokens.issue({
          aud: "restaurant",
          sub: staff.id,
          restaurantId: branch.restaurantId,
          role: "OWNER",
        }),
      ]);
      const requestCode = () =>
        api.inject({
          method: "POST",
          url: "/auth/customer/otp/request",
          payload: { phone },
        });
      const verifyCode = (code: string) =>
        api.inject({
          method: "POST",
          url: "/auth/customer/otp/verify",
          payload: { phone, code },
        });
      expect((await requestCode()).statusCode).toBe(204);
      const oldCode = otpCodes.get(phone);
      if (!oldCode) throw new Error("Expected fixture customer code.");

      const removed = await api.inject({
        method: "DELETE",
        url: "/customer/me",
        headers,
      });
      expect(removed.statusCode).toBe(204);
      expect(removed.body).toBe("");
      expect(
        await db.customer.findUniqueOrThrow({ where: { id: customer.id } }),
      ).toMatchObject({
        name: deletedCustomerName,
        phone: null,
        deletedAt: clock.now,
      });
      expect(
        await db.customerAddress.count({ where: { customerId: customer.id } }),
      ).toBe(0);
      expect(
        await db.refreshToken.count({ where: { customerId: customer.id } }),
      ).toBe(0);
      const retained = await db.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true, statusEvents: true, ledgerEntries: true },
      });
      expect(retained).toMatchObject({
        customerName: deletedCustomerName,
        customerPhone: null,
        addressSnapshot: geography,
        status: order.status,
        totalMinor: order.totalMinor,
        commissionMinor: order.commissionMinor,
      });
      expect(retained.addressSnapshot).toEqual(geography);
      expect(retained.items).toEqual(order.items);
      expect(retained.statusEvents).toEqual(order.statusEvents);
      expect(retained.ledgerEntries).toEqual(order.ledgerEntries);
      expect(
        await db.order.findUniqueOrThrow({ where: { id: otherOrder.id } }),
      ).toMatchObject({
        customerName: other.customer.name,
        customerPhone: other.customer.phone,
      });

      const adminHeaders = authorization(adminToken.accessToken);
      const [adminOrder, restaurantOrder, accessRejected, refreshRejected] =
        await Promise.all([
          api.inject({
            url: `/admin/orders/${order.id}`,
            headers: adminHeaders,
          }),
          api.inject({
            url: `/restaurant/orders/${order.id}`,
            headers: authorization(staffToken.accessToken),
          }),
          api.inject({ url: "/customer/me", headers }),
          api.inject({
            method: "POST",
            url: "/auth/refresh",
            payload: { refreshToken: pair.refreshToken },
          }),
        ]);
      for (const response of [adminOrder, restaurantOrder]) {
        expect(response.statusCode).toBe(200);
        expect(orderReadSchema.parse(response.json())).toMatchObject({
          customerName: deletedCustomerName,
          customerPhone: null,
          addressSnapshot: geography,
        });
      }
      const oldName = await api.inject({
        url: `/admin/orders?${new URLSearchParams({ q: customer.name ?? "" })}`,
        headers: adminHeaders,
      });
      expect(orderListResponseSchema.parse(oldName.json()).orders).toEqual([]);
      expect(accessRejected.statusCode).toBe(401);
      expect(refreshRejected.statusCode).toBe(401);
      expect((await verifyCode(oldCode)).statusCode).toBe(401);
      expect((await requestCode()).statusCode).toBe(429);

      clock.now = new Date(clock.now.getTime() + 61_000);
      expect((await requestCode()).statusCode).toBe(204);
      const newCode = otpCodes.get(phone);
      if (!newCode) throw new Error("Expected new customer code.");
      const newLogin = await verifyCode(newCode);
      expect(newLogin.statusCode).toBe(200);
      const newPair = authTokensSchema.parse(newLogin.json());
      const newCustomer = await tokens.verify(newPair.accessToken);
      expect(newCustomer.sub).not.toBe(customer.id);
      const privateOrder = await api.inject({
        url: `/customer/orders/${order.id}`,
        headers: authorization(newPair.accessToken),
      });
      expect(privateOrder.statusCode).toBe(404);
    } finally {
      await test.api.close();
    }
  },
  integrationTimeout,
);

it(
  "rolls back account and token changes when anonymizing an order fails",
  async () => {
    const test = openAuthTest();
    try {
      const { api, db } = test;
      const { customer, headers, createOrder } = await fixture(
        test,
        "+963998091125",
      );
      const order = await createOrder("DELIVERED");
      await db.$executeRaw`ALTER TABLE "Order" ADD CONSTRAINT "test_reject_identity_scrub" CHECK ("customerPhone" IS NOT NULL) NOT VALID`;
      try {
        const removed = await api.inject({
          method: "DELETE",
          url: "/customer/me",
          headers,
        });
        expect(removed.statusCode).toBe(500);
        expect(
          await db.customer.findUniqueOrThrow({ where: { id: customer.id } }),
        ).toMatchObject({
          name: customer.name,
          phone: customer.phone,
          deletedAt: null,
        });
        expect(
          await db.order.findUniqueOrThrow({ where: { id: order.id } }),
        ).toMatchObject({
          customerName: customer.name,
          customerPhone: customer.phone,
        });
        expect(
          await db.customerAddress.count({
            where: { customerId: customer.id },
          }),
        ).toBe(1);
        expect(
          await db.refreshToken.count({ where: { customerId: customer.id } }),
        ).toBe(1);
      } finally {
        await db.$executeRaw`ALTER TABLE "Order" DROP CONSTRAINT "test_reject_identity_scrub"`;
      }
    } finally {
      await test.api.close();
    }
  },
  integrationTimeout,
);

it(
  "cleans all tokens when deletion overlaps a refresh rotation",
  async () => {
    const test = openAuthTest();
    try {
      const { api, db } = test;
      const { customer, pair, headers } = await createAccount(
        test,
        "+963998091126",
      );
      const [removed, refreshed] = await Promise.all([
        api.inject({ method: "DELETE", url: "/customer/me", headers }),
        api.inject({
          method: "POST",
          url: "/auth/refresh",
          payload: { refreshToken: pair.refreshToken },
        }),
      ]);
      expect(removed.statusCode).toBe(204);
      expect([200, 401]).toContain(refreshed.statusCode);
      expect(
        await db.refreshToken.count({ where: { customerId: customer.id } }),
      ).toBe(0);
      if (refreshed.statusCode === 200) {
        const rotated = authTokensSchema.parse(refreshed.json());
        const stale = await api.inject({
          url: "/customer/me",
          headers: authorization(rotated.accessToken),
        });
        expect(stale.statusCode).toBe(401);
      }
    } finally {
      await test.api.close();
    }
  },
  integrationTimeout,
);
