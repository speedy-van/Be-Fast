import { createHash, randomInt, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  requireAdmin,
  requireAdminRole,
  requireCustomer,
  requireRestaurant,
  requireRestaurantRole,
} from "../src/auth/access.js";
import type { Principal, TokenPair } from "../src/auth/tokens.js";
import { openAuthTest } from "./auth-test-support.js";

const integrationTimeout = 20_000;
const sixtyDaysMs = 60 * 24 * 60 * 60 * 1_000;
type AuthTest = Awaited<ReturnType<typeof openAuthTest>>;

async function createCustomer(test: AuthTest) {
  const customer = await test.db.customer.create({ data: {} });
  const principal: Principal = { aud: "customer", sub: customer.id };
  return { principal, pair: await test.tokens.issue(principal) };
}

function refresh(test: AuthTest, refreshToken: string) {
  return test.api.inject({
    method: "POST",
    url: "/auth/refresh",
    payload: { refreshToken },
  });
}

function logout(test: AuthTest, refreshToken: string) {
  return test.api.inject({
    method: "POST",
    url: "/auth/logout",
    payload: { refreshToken },
  });
}

function expectInvalidRefresh(response: Awaited<ReturnType<typeof refresh>>) {
  expect(response.statusCode).toBe(401);
  expect(response.json()).toMatchObject({
    error: { code: "INVALID_REFRESH_TOKEN" },
  });
}

function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

describe("access JWTs", () => {
  it(
    "authenticates the proper audience and rejects all six other audience combinations",
    async () => {
      const test = await openAuthTest();
      try {
        test.api.get("/customer/probe", async (request) =>
          requireCustomer(request),
        );
        test.api.get("/restaurant/probe", async (request) =>
          requireRestaurant(request),
        );
        test.api.get("/admin/probe", async (request) => requireAdmin(request));
        const customer = await createCustomer(test);
        const staff = await test.db.restaurantUser.create({
          data: {
            phone: `+9639${String(randomInt(100_000_000)).padStart(8, "0")}`,
            passwordHash: "fixture",
            role: "CASHIER",
            restaurant: { create: { commissionRateBps: 1_000 } },
          },
        });
        const restaurantPrincipal: Principal = {
          aud: "restaurant",
          sub: staff.id,
          restaurantId: staff.restaurantId,
          role: "CASHIER",
        };
        const admin = await test.db.adminUser.create({
          data: {
            email: `${randomUUID()}@example.invalid`,
            passwordHash: "fixture",
            totpSecret: "fixture",
            role: "SUPPORT",
          },
        });
        const adminPrincipal: Principal = {
          aud: "admin",
          sub: admin.id,
          role: "SUPPORT",
        };
        const accounts = [
          customer,
          {
            principal: restaurantPrincipal,
            pair: await test.tokens.issue(restaurantPrincipal),
          },
          {
            principal: adminPrincipal,
            pair: await test.tokens.issue(adminPrincipal),
          },
        ];

        for (const { principal, pair } of accounts) {
          for (const scope of ["customer", "restaurant", "admin"]) {
            const response = await test.api.inject({
              method: "GET",
              url: `/${scope}/probe`,
              headers: { authorization: `Bearer ${pair.accessToken}` },
            });
            const allowed = scope === principal.aud;
            expect(response.statusCode, `${principal.aud} on ${scope}`).toBe(
              allowed ? 200 : 403,
            );
            expect(response.json()).toEqual(
              allowed
                ? principal
                : {
                    error: {
                      code: "FORBIDDEN",
                      message: expect.any(String),
                      details: {},
                    },
                  },
            );
          }
        }

        const unauthenticated = await test.api.inject({
          method: "GET",
          url: "/admin/probe",
        });
        expect(unauthenticated.statusCode).toBe(401);
        expect(unauthenticated.json()).toMatchObject({
          error: { code: "UNAUTHENTICATED" },
        });
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "requires the configured roles and rejects stale active grants",
    async () => {
      const test = await openAuthTest();
      try {
        test.api.get(
          "/restaurant/owner",
          { preHandler: requireRestaurantRole("OWNER") },
          async () => ({ allowed: true }),
        );
        test.api.get(
          "/admin/finance",
          { preHandler: requireAdminRole("FINANCE", "SUPER_ADMIN") },
          async () => ({ allowed: true }),
        );

        const restaurant = await test.db.restaurant.create({
          data: { commissionRateBps: 1_000 },
        });
        const staff = await test.db.restaurantUser.create({
          data: {
            restaurantId: restaurant.id,
            phone: `+9639${String(randomInt(100_000_000)).padStart(8, "0")}`,
            passwordHash: "fixture",
            role: "OWNER",
          },
        });
        const owner = await test.tokens.issue({
          aud: "restaurant",
          sub: staff.id,
          restaurantId: restaurant.id,
          role: "OWNER",
        });
        const administrator = await test.db.adminUser.create({
          data: {
            email: `${randomUUID()}@example.invalid`,
            passwordHash: "fixture",
            totpSecret: "fixture",
            role: "SUPPORT",
          },
        });
        const support = await test.tokens.issue({
          aud: "admin",
          sub: administrator.id,
          role: "SUPPORT",
        });
        const ownerRequest = {
          method: "GET",
          url: "/restaurant/owner",
          headers: { authorization: `Bearer ${owner.accessToken}` },
        } as const;
        const supportRequest = {
          method: "GET",
          url: "/admin/finance",
          headers: { authorization: `Bearer ${support.accessToken}` },
        } as const;

        expect((await test.api.inject(ownerRequest)).statusCode).toBe(200);
        expect((await test.api.inject(supportRequest)).statusCode).toBe(403);
        await test.db.restaurantUser.update({
          where: { id: staff.id },
          data: { role: "KITCHEN" },
        });
        expect((await test.api.inject(ownerRequest)).statusCode).toBe(401);

        const kitchen = (
          await refresh(test, owner.refreshToken)
        ).json<TokenPair>();
        expect(
          (
            await test.api.inject({
              ...ownerRequest,
              headers: { authorization: `Bearer ${kitchen.accessToken}` },
            })
          ).statusCode,
        ).toBe(403);
        await test.db.adminUser.update({
          where: { id: administrator.id },
          data: { isActive: false },
        });
        expect((await test.api.inject(supportRequest)).statusCode).toBe(401);
        expectInvalidRefresh(await refresh(test, support.refreshToken));
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "expires at exactly 15 minutes and rejects invalid signatures",
    async () => {
      const test = await openAuthTest();
      try {
        test.api.get("/customer/probe", async (request) =>
          requireCustomer(request),
        );
        const { pair } = await createCustomer(test);
        const request = {
          method: "GET",
          url: "/customer/probe",
          headers: { authorization: `Bearer ${pair.accessToken}` },
        } as const;
        const segments = pair.accessToken.split(".");
        const signature = segments[2] ?? "";
        const invalidSignature =
          (signature.startsWith("A") ? "B" : "A") + signature.slice(1);
        expect(
          (
            await test.api.inject({
              ...request,
              headers: {
                authorization: `Bearer ${segments[0]}.${segments[1]}.${invalidSignature}`,
              },
            })
          ).statusCode,
        ).toBe(401);

        test.clock.now = new Date(test.clock.now.getTime() + 15 * 60_000 - 1);
        expect((await test.api.inject(request)).statusCode).toBe(200);
        test.clock.now = new Date(test.clock.now.getTime() + 1);
        expect((await test.api.inject(request)).statusCode).toBe(401);
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );
});

describe("refresh token families", () => {
  it(
    "stores digests, rotates refresh tokens, and commits family revocation on replay",
    async () => {
      const test = await openAuthTest();
      try {
        const { principal, pair } = await createCustomer(test);
        const parallelLogin = await test.tokens.issue(principal);
        const original = await test.db.refreshToken.findUniqueOrThrow({
          where: { tokenHash: tokenDigest(pair.refreshToken) },
        });
        expect(original.tokenHash).not.toBe(pair.refreshToken);
        expect(original.expiresAt.getTime() - test.clock.now.getTime()).toBe(
          sixtyDaysMs,
        );

        const firstRotation = await refresh(test, pair.refreshToken);
        expect(firstRotation.statusCode).toBe(200);
        const rotated = firstRotation.json<TokenPair>();
        expect(rotated.refreshToken).not.toBe(pair.refreshToken);
        expect(await test.tokens.verify(rotated.accessToken)).toEqual(
          principal,
        );

        const secondRotation = await refresh(test, rotated.refreshToken);
        expect(secondRotation.statusCode).toBe(200);
        const newest = secondRotation.json<TokenPair>();
        expectInvalidRefresh(await refresh(test, pair.refreshToken));
        expectInvalidRefresh(await refresh(test, newest.refreshToken));

        const family = await test.db.refreshToken.findMany({
          where: { familyId: original.familyId },
        });
        expect(family).toHaveLength(3);
        expect(family.every((token) => token.revokedAt !== null)).toBe(true);
        expect(
          (await refresh(test, parallelLogin.refreshToken)).statusCode,
        ).toBe(200);
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "serializes concurrent refreshes of one token and revokes the winning rotation on reuse",
    async () => {
      const test = await openAuthTest();
      try {
        const { pair } = await createCustomer(test);
        const responses = await Promise.all([
          refresh(test, pair.refreshToken),
          refresh(test, pair.refreshToken),
        ]);
        expect(responses.map((response) => response.statusCode).sort()).toEqual(
          [200, 401],
        );
        const winner = responses
          .find((response) => response.statusCode === 200)
          ?.json<TokenPair>();
        if (!winner) throw new Error("Expected one successful refresh.");
        expectInvalidRefresh(await refresh(test, winner.refreshToken));
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "expires after 60 days and revokes the refresh family when logging out",
    async () => {
      const test = await openAuthTest();
      try {
        const { principal, pair } = await createCustomer(test);
        expect((await logout(test, pair.refreshToken)).statusCode).toBe(204);
        expect((await logout(test, pair.refreshToken)).statusCode).toBe(204);
        expectInvalidRefresh(await refresh(test, pair.refreshToken));

        const fresh = await test.tokens.issue(principal);
        test.clock.now = new Date(test.clock.now.getTime() + sixtyDaysMs);
        expectInvalidRefresh(await refresh(test, fresh.refreshToken));
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );
});
