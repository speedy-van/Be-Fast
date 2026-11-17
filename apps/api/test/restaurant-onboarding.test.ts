import { randomInt, randomUUID } from "node:crypto";
import type { InjectOptions } from "fastify";
import { describe, expect, it } from "vitest";
import type {
  AdminRole,
  RestaurantRole,
} from "../src/generated/prisma/enums.ts";
import { openAuthTest } from "./auth-test-support.js";

type Test = ReturnType<typeof openAuthTest>;
const integrationTimeout = 30_000;

function send(
  test: Test,
  accessToken: string,
  method: InjectOptions["method"],
  url: string,
  payload?: object,
) {
  return test.api.inject({
    method,
    url,
    payload,
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

async function restaurantStaff(
  test: Test,
  restaurantId: string,
  role: RestaurantRole,
) {
  const user = await test.db.restaurantUser.create({
    data: {
      restaurantId,
      role,
      phone: `+9639${String(randomInt(100_000_000)).padStart(8, "0")}`,
      passwordHash: "fixture",
    },
  });
  return (
    await test.tokens.issue({
      aud: "restaurant",
      sub: user.id,
      restaurantId,
      role,
    })
  ).accessToken;
}

async function restaurantOwner(test: Test) {
  const restaurant = await test.db.restaurant.create({
    data: {
      commissionRateBps: 1_000,
      branch: { create: {} },
    },
    include: { branch: true },
  });
  if (!restaurant.branch) throw new Error("Fixture restaurant has no branch.");
  const accessToken = await restaurantStaff(test, restaurant.id, "OWNER");
  return { id: restaurant.id, branchId: restaurant.branch.id, accessToken };
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
  return { id: user.id, accessToken };
}

async function testLocation(test: Test) {
  return test.db.neighborhood.create({
    data: {
      name: `Neighborhood ${randomUUID()}`,
      city: {
        create: {
          name: "City fixture",
          governorate: { create: { name: "Governorate fixture" } },
        },
      },
    },
  });
}

const periods = [{ dayOfWeek: 5, opensAt: "18:00", closesAt: "02:00" }];

async function fillProfileThroughRoutes(
  test: Test,
  restaurant: Awaited<ReturnType<typeof restaurantOwner>>,
) {
  const location = await testLocation(test);
  const category = await test.db.foodCategory.create({
    data: { name: `Category ${randomUUID()}` },
  });
  const patched = await send(
    test,
    restaurant.accessToken,
    "PATCH",
    "/restaurant/profile",
    {
      name: "Restaurant fixture",
      contactPhone: "0998887777",
      categoryIds: [category.id],
      neighborhoodId: location.id,
      address: "Fixture address",
    },
  );
  expect(patched.statusCode, patched.body).toBe(200);
  expect(patched.json()).toMatchObject({
    id: restaurant.id,
    status: "DRAFT",
    contactPhone: "+963998887777",
    categoryIds: [category.id],
    branch: {
      id: restaurant.branchId,
      neighborhoodId: location.id,
      address: "Fixture address",
    },
  });
  const schedule = await send(
    test,
    restaurant.accessToken,
    "PUT",
    "/restaurant/branch/opening-periods",
    { periods },
  );
  expect(schedule.statusCode, schedule.body).toBe(200);
  expect(schedule.json()).toEqual({ periods });
  const serviceAreas = await send(
    test,
    restaurant.accessToken,
    "PUT",
    "/restaurant/branch/delivery-zones",
    {
      zones: [{ neighborhoodId: location.id, feeMinor: 1_200, etaMinutes: 25 }],
    },
  );
  expect(serviceAreas.statusCode, serviceAreas.body).toBe(200);
  expect(serviceAreas.json()).toEqual({
    zones: [
      expect.objectContaining({
        neighborhoodId: location.id,
        feeMinor: 1_200,
        etaMinutes: 25,
      }),
    ],
  });
}

async function attachMediaFixture(test: Test, restaurantId: string) {
  await test.db.restaurant.update({
    where: { id: restaurantId },
    data: {
      logoKey: `fixture/${restaurantId}/logo.webp`,
      coverImageKey: `fixture/${restaurantId}/cover.webp`,
    },
  });
  return test.db.restaurantDocument.create({
    data: {
      restaurantId,
      type: "LICENSE",
      storageKey: `fixture/${restaurantId}/private/license.webp`,
    },
  });
}

describe("restaurant review workflow", () => {
  it(
    "requires the full profile, location, hours, delivery zone, and media before submission",
    async () => {
      const test = openAuthTest();
      try {
        const owner = await restaurantOwner(test);
        const submit = () =>
          send(test, owner.accessToken, "POST", "/restaurant/profile/submit");
        const initial = await submit();
        expect(initial.statusCode).toBe(409);
        expect(initial.json()).toMatchObject({
          error: {
            details: {
              missing: expect.arrayContaining([
                "name",
                "contactPhone",
                "category",
                "neighborhoodId",
                "address",
                "logo",
                "coverImage",
                "openingPeriod",
                "deliveryZone",
                "document",
              ]),
            },
          },
        });
        await attachMediaFixture(test, owner.id);

        const settings = await send(
          test,
          owner.accessToken,
          "PATCH",
          "/restaurant/branch/settings",
          {
            minOrderMinor: 3_500,
            pickupEnabled: true,
          },
        );
        expect(settings.statusCode, settings.body).toBe(200);
        expect(settings.json()).toEqual({
          minOrderMinor: 3_500,
          pickupEnabled: true,
        });
        await fillProfileThroughRoutes(test, owner);

        const both = await Promise.all([submit(), submit()]);
        expect(both.map(({ statusCode }) => statusCode).sort()).toEqual([
          200, 409,
        ]);
        expect(
          both.find(({ statusCode }) => statusCode === 200)?.json(),
        ).toEqual({ status: "PENDING_REVIEW" });
        const stored = await test.db.restaurant.findUniqueOrThrow({
          where: { id: owner.id },
        });
        expect(stored.status).toBe("PENDING_REVIEW");
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "allows reject/edit/resubmit and conditional approval, suspension, and resumption with audits",
    async () => {
      const test = openAuthTest();
      try {
        const owner = await restaurantOwner(test);
        const operations = await admin(test, "OPERATIONS");
        const finance = await admin(test, "FINANCE");
        const submit = () =>
          send(test, owner.accessToken, "POST", "/restaurant/profile/submit");
        const decide = (action: string, payload?: object) =>
          send(
            test,
            operations.accessToken,
            "POST",
            `/admin/restaurants/${owner.id}/${action}`,
            payload,
          );

        await fillProfileThroughRoutes(test, owner);
        await attachMediaFixture(test, owner.id);
        expect((await submit()).statusCode).toBe(200);

        const pending = await send(
          test,
          operations.accessToken,
          "GET",
          "/admin/restaurants?status=PENDING_REVIEW",
        );
        expect(pending.statusCode, pending.body).toBe(200);
        expect(pending.json()).toContainEqual(
          expect.objectContaining({ id: owner.id, status: "PENDING_REVIEW" }),
        );
        expect(
          (
            await send(
              test,
              finance.accessToken,
              "POST",
              `/admin/restaurants/${owner.id}/approve`,
              { reason: "Reason" },
            )
          ).statusCode,
        ).toBe(403);
        expect((await decide("reject", { reason: " " })).statusCode).toBe(400);
        const rejected = await decide("reject", { reason: "Rejected fixture" });
        expect(rejected.statusCode, rejected.body).toBe(200);
        expect(rejected.json()).toEqual({
          status: "REJECTED",
          reviewReason: "Rejected fixture",
        });
        expect((await decide("approve", { reason: "Reason" })).statusCode).toBe(
          409,
        );

        const revised = await send(
          test,
          owner.accessToken,
          "PATCH",
          `/restaurant/branches/${owner.branchId}/profile`,
          { name: "Revised fixture" },
        );
        expect(revised.statusCode, revised.body).toBe(200);
        expect((await submit()).statusCode).toBe(200);
        expect(
          (await decide("approve", { reason: "Approved fixture" })).statusCode,
        ).toBe(200);
        expect(
          (await decide("suspend", { reason: "Suspended fixture" })).statusCode,
        ).toBe(200);
        expect(
          (await decide("resume", { reason: "Resumed fixture" })).statusCode,
        ).toBe(200);

        const details = await send(
          test,
          operations.accessToken,
          "GET",
          `/admin/restaurants/${owner.id}`,
        );
        expect(details.statusCode, details.body).toBe(200);
        expect(details.json()).toMatchObject({
          id: owner.id,
          name: "Revised fixture",
          status: "APPROVED",
          reviewReason: "Resumed fixture",
        });
        const audits = await test.db.auditLog.findMany({
          where: { entityId: owner.id, adminUserId: operations.id },
          orderBy: { createdAt: "asc" },
        });
        expect(
          audits.map(({ action, before, after }) => ({
            action,
            before,
            after,
          })),
        ).toEqual([
          {
            action: "RESTAURANT_REJECT",
            before: { status: "PENDING_REVIEW", reviewReason: null },
            after: { status: "REJECTED", reviewReason: "Rejected fixture" },
          },
          {
            action: "RESTAURANT_APPROVE",
            before: { status: "PENDING_REVIEW", reviewReason: null },
            after: { status: "APPROVED", reviewReason: "Approved fixture" },
          },
          {
            action: "RESTAURANT_SUSPEND",
            before: { status: "APPROVED", reviewReason: "Approved fixture" },
            after: { status: "SUSPENDED", reviewReason: "Suspended fixture" },
          },
          {
            action: "RESTAURANT_RESUME",
            before: { status: "SUSPENDED", reviewReason: "Suspended fixture" },
            after: { status: "APPROVED", reviewReason: "Resumed fixture" },
          },
        ]);
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "only allows finance staff to change commission and records exact before and after values",
    async () => {
      const test = openAuthTest();
      try {
        const owner = await restaurantOwner(test);
        const operations = await admin(test, "OPERATIONS");
        const finance = await admin(test, "FINANCE");
        const endpoint = `/admin/restaurants/${owner.id}/commission`;
        const commissions = "/admin/restaurants/commissions";
        expect(
          (await send(test, operations.accessToken, "GET", commissions))
            .statusCode,
        ).toBe(403);
        const read = await send(test, finance.accessToken, "GET", commissions);
        expect(read.statusCode).toBe(200);
        expect(read.json()).toContainEqual({
          id: owner.id,
          name: null,
          commissionRateBps: 1_000,
        });
        expect(
          (
            await send(
              test,
              finance.accessToken,
              "GET",
              `/admin/restaurants/${owner.id}`,
            )
          ).statusCode,
        ).toBe(403);
        const change = { commissionRateBps: 1_750 };
        const denied = await send(
          test,
          operations.accessToken,
          "PATCH",
          endpoint,
          change,
        );
        expect(denied.statusCode).toBe(403);
        expect(
          (
            await send(test, finance.accessToken, "PATCH", endpoint, {
              commissionRateBps: -1,
            })
          ).statusCode,
        ).toBe(400);

        const updated = await send(
          test,
          finance.accessToken,
          "PATCH",
          endpoint,
          change,
        );
        expect(updated.statusCode, updated.body).toBe(200);
        expect(updated.json()).toEqual(change);
        expect(
          await test.db.restaurant.findUniqueOrThrow({
            where: { id: owner.id },
            select: { commissionRateBps: true },
          }),
        ).toEqual(change);
        const audits = await test.db.auditLog.findMany({
          where: { entityType: "Restaurant", entityId: owner.id },
        });
        expect(audits).toEqual([
          expect.objectContaining({
            adminUserId: finance.id,
            action: "RESTAURANT_COMMISSION_UPDATE",
            before: { commissionRateBps: 1_000 },
            after: change,
          }),
        ]);
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );
});

describe("restaurant onboarding tenant separation and permissions", () => {
  it(
    "returns 404 for another restaurant's profile, zone, and private document",
    async () => {
      const test = openAuthTest();
      try {
        const own = await restaurantOwner(test);
        const other = await restaurantOwner(test);
        const location = await testLocation(test);
        const zone = await test.db.deliveryZone.create({
          data: {
            branchId: other.branchId,
            neighborhoodId: location.id,
            feeMinor: 1_200n,
            etaMinutes: 25,
          },
        });
        const document = await attachMediaFixture(test, other.id);
        const targetProfile = `/restaurant/branches/${other.branchId}/profile`;
        const targetZone = `/restaurant/delivery-zones/${zone.id}`;
        const targetDocument = `/restaurant/documents/${document.id}`;

        expect(
          (await send(test, other.accessToken, "GET", targetProfile))
            .statusCode,
        ).toBe(200);
        expect(
          (await send(test, other.accessToken, "GET", targetZone)).statusCode,
        ).toBe(200);
        expect(
          (await send(test, other.accessToken, "GET", targetDocument))
            .statusCode,
        ).toBe(200);
        for (const [method, url, payload] of [
          ["GET", targetProfile],
          ["PATCH", targetProfile, { name: "Wrong tenant" }],
          ["GET", targetZone],
          ["PATCH", targetZone, { feeMinor: 0 }],
          ["DELETE", targetZone],
          ["GET", targetDocument],
        ] as const) {
          const response = await send(
            test,
            own.accessToken,
            method,
            url,
            payload,
          );
          expect(response.statusCode, `${method} ${url}`).toBe(404);
          expect(response.json()).toMatchObject({
            error: { code: "NOT_FOUND" },
          });
        }
        expect(
          (
            await test.db.deliveryZone.findUniqueOrThrow({
              where: { id: zone.id },
            })
          ).feeMinor,
        ).toBe(1_200n);
        expect(
          (
            await test.db.restaurant.findUniqueOrThrow({
              where: { id: other.id },
            })
          ).name,
        ).toBeNull();
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "delegates branch settings to managers and denies submissions and branch edits to other roles",
    async () => {
      const test = openAuthTest();
      try {
        const owner = await restaurantOwner(test);
        const manager = await restaurantStaff(test, owner.id, "MANAGER");
        const cashier = await restaurantStaff(test, owner.id, "CASHIER");
        const kitchen = await restaurantStaff(test, owner.id, "KITCHEN");
        const scheduleEndpoint = "/restaurant/branch/opening-periods";
        const venueEndpoint = "/restaurant/branch/delivery-zones";
        const settingsEndpoint = "/restaurant/branch/settings";

        const location = await testLocation(test);
        const zones = [
          { neighborhoodId: location.id, feeMinor: 900, etaMinutes: 20 },
        ];
        expect(
          (await send(test, manager, "PUT", scheduleEndpoint, { periods }))
            .statusCode,
        ).toBe(200);
        expect(
          (await send(test, manager, "PUT", venueEndpoint, { zones }))
            .statusCode,
        ).toBe(200);
        expect(
          (
            await send(test, manager, "PATCH", settingsEndpoint, {
              pickupEnabled: true,
            })
          ).statusCode,
        ).toBe(200);
        for (const actor of [cashier, kitchen]) {
          expect(
            (await send(test, actor, "PUT", scheduleEndpoint, { periods }))
              .statusCode,
          ).toBe(403);
          expect(
            (await send(test, actor, "PUT", venueEndpoint, { zones }))
              .statusCode,
          ).toBe(403);
          expect(
            (
              await send(test, actor, "PATCH", settingsEndpoint, {
                pickupEnabled: true,
              })
            ).statusCode,
          ).toBe(403);
        }
        for (const actor of [manager, cashier, kitchen]) {
          expect(
            (await send(test, actor, "POST", "/restaurant/profile/submit"))
              .statusCode,
          ).toBe(403);
          expect(
            (
              await send(test, actor, "PATCH", "/restaurant/profile", {
                name: "Unsupported role",
              })
            ).statusCode,
          ).toBe(403);
        }
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );
});
