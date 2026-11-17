import { randomUUID } from "node:crypto";
import {
  adminAuditLogSchema,
  adminCustomerDetailSchema,
  adminCustomerSchema,
  adminCustomerSearchSchema,
  adminDashboardSchema,
  adminSessionSchema,
  adminSettingsSchema,
  adminUserListSchema,
  adminUserSchema,
  errorEnvelopeSchema,
} from "@be-fast/contracts";
import type { HTTPMethods } from "fastify";
import { expect, it } from "vitest";
import type { AdminRole, OrderStatus } from "../src/generated/prisma/enums.ts";
import { openAuthTest } from "./auth-test-support.js";

type Test = ReturnType<typeof openAuthTest>;
const integrationTimeout = 40_000;

async function admin(test: Test, role: AdminRole) {
  const account = await test.db.adminUser.create({
    data: {
      email: `${randomUUID()}@example.invalid`,
      passwordHash: "fixture",
      totpSecret: "fixture",
      role,
    },
  });
  const pair = await test.tokens.issue({ aud: "admin", sub: account.id, role });
  return {
    id: account.id,
    request: (method: HTTPMethods, url: string, payload?: object) =>
      test.api.inject({
        method,
        url,
        payload,
        headers: { authorization: `Bearer ${pair.accessToken}` },
      }),
  };
}

async function makeOrder(
  test: Test,
  branchId: string,
  customerId: string,
  status: OrderStatus,
  needsAttention = false,
) {
  return test.db.order.create({
    data: {
      branchId,
      customerId,
      orderNumber: `fixture-${randomUUID()}`,
      idempotencyKey: randomUUID(),
      type: "PICKUP",
      status,
      needsAttention,
      createdAt: test.clock.now,
      customerName: "Fixture customer",
      foodSubtotalMinor: 20_000n,
      deliveryFeeMinor: 0n,
      totalMinor: 20_000n,
      commissionRateBps: 1000,
      commissionMinor: 2000n,
    },
  });
}

it(
  "summarizes live work and masks dashboard groups according to the admin role",
  async () => {
    const test = openAuthTest();
    try {
      const { db, clock } = test;
      const [ops, support, finance] = await Promise.all([
        admin(test, "OPERATIONS"),
        admin(test, "SUPPORT"),
        admin(test, "FINANCE"),
      ]);
      const session = await ops.request("GET", "/admin/session");
      expect(session.statusCode).toBe(200);
      expect(adminSessionSchema.parse(session.json())).toMatchObject({
        id: ops.id,
        role: "OPERATIONS",
      });
      const route = "/admin/dashboard";
      const baseline = adminDashboardSchema.parse(
        (await ops.request("GET", route)).json(),
      );

      const currentDay = 2;
      const nowMs = clock.now.getTime();
      const branch = async (
        acceptingOrders: boolean,
        lastSeenAt: Date | null,
        dayOfWeek = currentDay,
      ) =>
        db.branch.create({
          data: {
            acceptingOrders,
            lastSeenAt,
            restaurant: {
              create: {
                name: "Dashboard branch",
                status: "APPROVED",
                commissionRateBps: 1_000,
              },
            },
            openingPeriods: {
              create: { dayOfWeek, opensAt: "11:00", closesAt: "13:00" },
            },
          },
        });
      const [offline, neverSeen, exactlyTwoMinutes, paused, closed, customer] =
        await Promise.all([
          branch(true, new Date(nowMs - 120_001)),
          branch(true, null),
          branch(true, new Date(nowMs - 120_000)),
          branch(false, null),
          branch(true, null, 3),
          db.customer.create({ data: {} }),
        ]);
      await Promise.all([
        db.restaurant.create({
          data: { commissionRateBps: 1_000, status: "PENDING_REVIEW" },
        }),
        makeOrder(test, offline.id, customer.id, "PENDING", true),
        makeOrder(test, offline.id, customer.id, "PREPARING"),
        makeOrder(test, offline.id, customer.id, "DELIVERED"),
      ]);

      const dashboard = await ops.request("GET", route);
      expect(dashboard.statusCode).toBe(200);
      const summary = adminDashboardSchema.parse(dashboard.json());
      expect(summary.activeOrderCount).toBe(
        (baseline.activeOrderCount ?? 0) + 2,
      );
      expect(summary.needsAttentionCount).toBe(
        (baseline.needsAttentionCount ?? 0) + 1,
      );
      expect(summary.pendingRestaurantCount).toBe(
        (baseline.pendingRestaurantCount ?? 0) + 1,
      );
      const offlineIds = summary.offlineBranches?.map(({ id }) => id);
      expect(offlineIds).toEqual(
        expect.arrayContaining([offline.id, neverSeen.id]),
      );
      for (const { id } of [exactlyTwoMinutes, paused, closed])
        expect(offlineIds).not.toContain(id);

      expect(
        adminDashboardSchema.parse(
          (await support.request("GET", route)).json(),
        ),
      ).toEqual({
        activeOrderCount: summary.activeOrderCount,
        needsAttentionCount: summary.needsAttentionCount,
        pendingRestaurantCount: null,
        offlineBranches: null,
      });
      expect(
        adminDashboardSchema.parse(
          (await finance.request("GET", route)).json(),
        ),
      ).toEqual({
        activeOrderCount: null,
        needsAttentionCount: null,
        pendingRestaurantCount: null,
        offlineBranches: null,
      });
    } finally {
      await test.api.close();
    }
  },
  integrationTimeout,
);

it(
  "lets support search and inspect customer orders while only super admins can block with a reason",
  async () => {
    const test = openAuthTest();
    try {
      const { api, db, tokens, clock } = test;
      const [superAdmin, support, finance] = await Promise.all([
        admin(test, "SUPER_ADMIN"),
        admin(test, "SUPPORT"),
        admin(test, "FINANCE"),
      ]);
      const [customer, branch] = await Promise.all([
        db.customer.create({
          data: { phone: "+963998090091", name: "Fixture customer" },
        }),
        db.branch.create({
          data: { restaurant: { create: { commissionRateBps: 1_000 } } },
        }),
      ]);
      const order = await makeOrder(test, branch.id, customer.id, "PENDING");
      const path = `/admin/customers/${customer.id}`;
      const search = "/admin/customers?phone=0998090091";
      const result = await support.request("GET", search);
      expect(result.statusCode).toBe(200);
      expect(
        adminCustomerSearchSchema
          .parse(result.json())
          .customers.map(({ id }) => id),
      ).toEqual([customer.id]);
      const detail = await support.request("GET", path);
      expect(detail.statusCode).toBe(200);
      expect(adminCustomerDetailSchema.parse(detail.json())).toMatchObject({
        customer: { id: customer.id },
        orders: [{ id: order.id }],
      });
      expect((await finance.request("GET", search)).statusCode).toBe(403);

      const reason = "Fixture reason";
      const block = `${path}/block`;
      expect(
        (await support.request("PATCH", block, { blocked: true, reason }))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await superAdmin.request("PATCH", block, {
            blocked: true,
            reason: " ",
          })
        ).statusCode,
      ).toBe(400);
      const blocked = await superAdmin.request("PATCH", block, {
        blocked: true,
        reason,
      });
      expect(blocked.statusCode).toBe(200);
      expect(adminCustomerSchema.parse(blocked.json()).blockedAt).toBe(
        clock.now.toISOString(),
      );

      const pair = await tokens.issue({ aud: "customer", sub: customer.id });
      const denied = await api.inject({
        method: "POST",
        url: "/customer/orders",
        headers: {
          authorization: `Bearer ${pair.accessToken}`,
          "idempotency-key": randomUUID(),
        },
        payload: {
          branchId: branch.id,
          type: "PICKUP",
          items: [
            {
              menuItemId: randomUUID(),
              sizeId: randomUUID(),
              optionIds: [],
              quantity: 1,
            },
          ],
          expectedTotalMinor: 20_000,
        },
      });
      expect(denied.statusCode).toBe(403);
      expect(errorEnvelopeSchema.parse(denied.json()).error.code).toBe(
        "ACCOUNT_UNAVAILABLE",
      );
      const unblocked = await superAdmin.request("PATCH", block, {
        blocked: false,
        reason,
      });
      expect(unblocked.statusCode).toBe(200);
      expect(adminCustomerSchema.parse(unblocked.json()).blockedAt).toBeNull();

      const auditUrl = `/admin/audit-log?entityId=${customer.id}`;
      expect((await support.request("GET", auditUrl)).statusCode).toBe(403);
      const audit = await superAdmin.request("GET", auditUrl);
      expect(audit.statusCode).toBe(200);
      expect(adminAuditLogSchema.parse(audit.json()).entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "CUSTOMER_BLOCK",
            after: { blockedAt: clock.now.toISOString(), reason },
          }),
          expect.objectContaining({
            action: "CUSTOMER_UNBLOCK",
            after: { blockedAt: null, reason },
          }),
        ]),
      );
      expect(
        (await superAdmin.request("POST", "/admin/audit-log", {})).statusCode,
      ).toBe(404);
    } finally {
      await test.api.close();
    }
  },
  integrationTimeout,
);

it(
  "changes the platform default only for super admins and applies it only to newly registered restaurants",
  async () => {
    const test = openAuthTest();
    const settingKey = "commission.defaultRateBps";
    const { api, db, otpCodes } = test;
    let initial: Awaited<ReturnType<typeof db.platformSetting.findUnique>> =
      null;
    let settingTouched = false;
    try {
      initial = await db.platformSetting.findUnique({
        where: { key: settingKey },
      });
      await db.platformSetting.upsert({
        where: { key: settingKey },
        create: { key: settingKey, value: 1_000 },
        update: { value: 1_000 },
      });
      settingTouched = true;
      const [superAdmin, finance, existing] = await Promise.all([
        admin(test, "SUPER_ADMIN"),
        admin(test, "FINANCE"),
        db.restaurant.create({ data: { commissionRateBps: 1_000 } }),
      ]);
      const settings = "/admin/settings";
      const update = { defaultCommissionRateBps: 2_150 };
      expect((await finance.request("GET", settings)).statusCode).toBe(403);
      expect(
        (await finance.request("PATCH", settings, update)).statusCode,
      ).toBe(403);
      expect(
        (
          await superAdmin.request("PATCH", settings, {
            defaultCommissionRateBps: 10_001,
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (await superAdmin.request("PATCH", settings, { expireAfterSec: 0 }))
          .statusCode,
      ).toBe(400);
      const changed = await superAdmin.request("PATCH", settings, update);
      expect(changed.statusCode).toBe(200);
      expect(adminSettingsSchema.parse(changed.json())).toMatchObject(update);
      const read = await superAdmin.request("GET", settings);
      expect(read.statusCode).toBe(200);
      expect(adminSettingsSchema.parse(read.json())).toMatchObject(update);
      expect(
        await db.restaurant.findUniqueOrThrow({ where: { id: existing.id } }),
      ).toMatchObject({ commissionRateBps: 1_000 });

      const phone = "+963998090092";
      expect(
        (
          await api.inject({
            method: "POST",
            url: "/auth/restaurant/otp/request",
            payload: { phone },
          })
        ).statusCode,
      ).toBe(204);
      const code = otpCodes.get(phone);
      if (!code) throw new Error("Expected restaurant verification challenge.");
      expect(
        (
          await api.inject({
            method: "POST",
            url: "/auth/restaurant/register",
            payload: { phone, code, password: randomUUID() },
          })
        ).statusCode,
      ).toBe(201);
      const owner = await db.restaurantUser.findUniqueOrThrow({
        where: { phone },
        include: { restaurant: true },
      });
      expect(owner.restaurant.commissionRateBps).toBe(2_150);

      const targeted = await finance.request(
        "PATCH",
        `/admin/restaurants/${existing.id}/commission`,
        { commissionRateBps: 750 },
      );
      expect(targeted.statusCode).toBe(200);
      expect(targeted.json()).toEqual({ commissionRateBps: 750 });
      const audit = adminAuditLogSchema.parse(
        (
          await superAdmin.request(
            "GET",
            `/admin/audit-log?entityId=${settingKey}`,
          )
        ).json(),
      );
      expect(audit.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "PLATFORM_SETTING_UPDATE",
            before: { value: 1_000 },
            after: { value: 2_150 },
            adminUserId: superAdmin.id,
          }),
        ]),
      );
    } finally {
      try {
        if (settingTouched) {
          if (initial !== null)
            await db.$executeRaw`UPDATE "PlatformSetting" SET "value" = ${JSON.stringify(initial.value)}::jsonb WHERE "key" = ${settingKey}`;
          else await db.platformSetting.delete({ where: { key: settingKey } });
        }
      } finally {
        await api.close();
      }
    }
  },
  integrationTimeout,
);

it(
  "limits admin role changes to super admins, omits credentials from responses, and audits the update",
  async () => {
    const test = openAuthTest();
    try {
      const [superAdmin, target] = await Promise.all([
        admin(test, "SUPER_ADMIN"),
        admin(test, "OPERATIONS"),
      ]);
      const users = "/admin/users";
      const path = `${users}/${target.id}/role`;
      const update = { role: "SUPPORT" };
      expect((await target.request("GET", users)).statusCode).toBe(403);
      expect((await target.request("PATCH", path, update)).statusCode).toBe(
        403,
      );
      const response = await superAdmin.request("GET", users);
      expect(response.statusCode).toBe(200);
      expect(
        adminUserListSchema
          .parse(response.json())
          .users.some(({ id }) => id === target.id),
      ).toBe(true);
      const changed = await superAdmin.request("PATCH", path, update);
      expect(changed.statusCode).toBe(200);
      expect(adminUserSchema.parse(changed.json())).toMatchObject({
        id: target.id,
        role: "SUPPORT",
      });
      expect((await target.request("GET", "/admin/session")).statusCode).toBe(
        401,
      );
      const audit = adminAuditLogSchema.parse(
        (
          await superAdmin.request(
            "GET",
            `/admin/audit-log?entityId=${target.id}`,
          )
        ).json(),
      );
      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0]).toMatchObject({
        action: "ADMIN_USER_ROLE_UPDATE",
        before: { role: "OPERATIONS" },
        after: update,
      });
    } finally {
      await test.api.close();
    }
  },
  integrationTimeout,
);
