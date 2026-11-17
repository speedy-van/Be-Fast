import { randomUUID } from "node:crypto";
import {
  authTokensSchema,
  errorEnvelopeSchema,
  restaurantStaffListSchema,
  restaurantStaffMemberSchema,
} from "@be-fast/contracts";
import type { HTTPMethods } from "fastify";
import { expect, it } from "vitest";
import type { RestaurantRole } from "../src/generated/prisma/enums.ts";
import { openAuthTest } from "./auth-test-support.js";

const staffPath = "/restaurant/staff";
const loginPath = "/auth/restaurant/login";

function authenticated(
  test: ReturnType<typeof openAuthTest>,
  accessToken: string,
) {
  return (
    method: HTTPMethods,
    url: string,
    payload?: Record<string, unknown>,
  ) =>
    test.api.inject({
      method,
      url,
      payload,
      headers: { authorization: `Bearer ${accessToken}` },
    });
}

async function restaurantUser(
  test: ReturnType<typeof openAuthTest>,
  phone: string,
  role: RestaurantRole,
  restaurantId: string,
  passwordChangeRequired = false,
) {
  return test.db.restaurantUser.create({
    data: {
      phone,
      role,
      restaurantId,
      passwordHash: "unused",
      passwordChangeRequired,
    },
    select: { id: true },
  });
}

async function ownerFixture(
  test: ReturnType<typeof openAuthTest>,
  phone: string,
) {
  const restaurant = await test.db.restaurant.create({
    data: { commissionRateBps: 1_000 },
    select: { id: true },
  });
  const owner = await restaurantUser(test, phone, "OWNER", restaurant.id);
  const { accessToken } = await test.tokens.issue({
    aud: "restaurant",
    sub: owner.id,
    restaurantId: restaurant.id,
    role: "OWNER",
  });
  return {
    userId: owner.id,
    restaurantId: restaurant.id,
    request: authenticated(test, accessToken),
  };
}

it("limits staff management to the restaurant owner and isolates registered staff by restaurant", async () => {
  const test = openAuthTest();
  try {
    const first = await ownerFixture(test, "+963900000081");
    const second = await ownerFixture(test, "+963900000082");
    const input = {
      phone: "0900000083",
      temporaryPassword: randomUUID(),
      role: "CASHIER",
    };
    expect(
      (
        await first.request("POST", staffPath, {
          ...input,
          restaurantId: second.restaurantId,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await first.request("POST", staffPath, { ...input, role: "OWNER" }))
        .statusCode,
    ).toBe(400);

    const created = await first.request("POST", staffPath, input);
    expect(created.statusCode).toBe(201);
    const employee = restaurantStaffMemberSchema.parse(created.json());
    expect(Object.keys(created.json()).sort()).toEqual([
      "id",
      "isActive",
      "passwordChangeRequired",
      "phone",
      "role",
    ]);
    expect(employee.role).toBe("CASHIER");
    expect(employee.passwordChangeRequired).toBe(true);
    expect(employee.isActive).toBe(true);
    const detail = `${staffPath}/${employee.id}`;
    expect(
      restaurantStaffListSchema.parse(
        (await first.request("GET", staffPath)).json(),
      ),
    ).toEqual([employee]);
    expect(
      restaurantStaffListSchema.parse(
        (await second.request("GET", staffPath)).json(),
      ),
    ).toEqual([]);
    expect(
      (await second.request("PATCH", detail, { role: "KITCHEN" })).statusCode,
    ).toBe(404);
    expect((await second.request("DELETE", detail)).statusCode).toBe(404);
    expect((await second.request("POST", staffPath, input)).statusCode).toBe(
      409,
    );
    expect(
      (
        await first.request("PATCH", `${staffPath}/${first.userId}`, {
          role: "CASHIER",
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await first.request("DELETE", `${staffPath}/${first.userId}`))
        .statusCode,
    ).toBe(404);
    expect(
      (await first.request("PATCH", detail, { role: "OWNER" })).statusCode,
    ).toBe(400);

    const cases = [
      ["MANAGER", "+963900000084"],
      ["CASHIER", "+963900000085"],
      ["KITCHEN", "+963900000086"],
    ] as const;
    for (const [role, phone] of cases) {
      const user = await restaurantUser(test, phone, role, first.restaurantId);
      const { accessToken } = await test.tokens.issue({
        aud: "restaurant",
        sub: user.id,
        restaurantId: first.restaurantId,
        role,
      });
      const request = authenticated(test, accessToken);
      expect((await request("GET", staffPath)).statusCode).toBe(403);
      expect((await request("POST", staffPath, input)).statusCode).toBe(403);
      expect(
        (await request("PATCH", detail, { role: "MANAGER" })).statusCode,
      ).toBe(403);
      expect((await request("DELETE", detail)).statusCode).toBe(403);
    }

    const updated = await first.request("PATCH", detail, { role: "KITCHEN" });
    expect(updated.statusCode).toBe(200);
    expect(restaurantStaffMemberSchema.parse(updated.json()).role).toBe(
      "KITCHEN",
    );
    expect((await first.request("DELETE", detail)).statusCode).toBe(204);
    expect((await first.request("DELETE", detail)).statusCode).toBe(204);
    const stored = await test.db.restaurantUser.findUniqueOrThrow({
      where: { id: employee.id },
      select: { isActive: true, restaurantId: true },
    });
    expect(stored).toEqual({
      isActive: false,
      restaurantId: first.restaurantId,
    });
  } finally {
    await test.api.close();
  }
}, 30_000);

it("only uses a temporary password to replace it once and denies future sessions after disabling staff", async () => {
  const test = openAuthTest();
  const { api, db, tokens } = test;
  try {
    const owner = await ownerFixture(test, "+963900000091");
    const phone = "+963900000092";
    const temporaryBase = randomUUID();
    const temporaryPassword = `${temporaryBase}\uD800`;
    const create = await owner.request("POST", staffPath, {
      phone,
      temporaryPassword,
      role: "CASHIER",
    });
    expect(create.statusCode).toBe(201);
    const employee = restaurantStaffMemberSchema.parse(create.json());
    const detail = `${staffPath}/${employee.id}`;
    const staffTokenCount = () =>
      db.refreshToken.count({ where: { restaurantUserId: employee.id } });

    function login(password: string, newPassword?: string) {
      return api.inject({
        method: "POST",
        url: loginPath,
        payload: { phone, password, newPassword },
      });
    }

    const incomplete = await login(temporaryPassword);
    expect(incomplete.statusCode).toBe(403);
    expect(errorEnvelopeSchema.parse(incomplete.json()).error.code).toBe(
      "PASSWORD_CHANGE_REQUIRED",
    );
    expect(authTokensSchema.safeParse(incomplete.json()).success).toBe(false);
    expect((await login(randomUUID(), randomUUID())).statusCode).toBe(401);
    expect((await login(temporaryPassword, temporaryPassword)).statusCode).toBe(
      400,
    );
    expect(
      (await login(temporaryPassword, `${temporaryBase}\uD801`)).statusCode,
    ).toBe(400);
    expect(await staffTokenCount()).toBe(0);

    const replacements = [randomUUID(), randomUUID()];
    const attempts = await Promise.all(
      replacements.map((newPassword) => login(temporaryPassword, newPassword)),
    );
    expect(attempts.map(({ statusCode }) => statusCode).sort()).toEqual([
      200, 401,
    ]);
    const winner = attempts.findIndex(({ statusCode }) => statusCode === 200);
    const completed = attempts[winner];
    const password = replacements[winner];
    if (!completed || !password)
      throw new Error(
        "A single temporary password replacement should succeed.",
      );
    const session = authTokensSchema.parse(completed.json());
    expect(await staffTokenCount()).toBe(1);
    expect(await tokens.verify(session.accessToken)).toEqual({
      aud: "restaurant",
      sub: employee.id,
      restaurantId: owner.restaurantId,
      role: "CASHIER",
    });
    expect(await db.otpChallenge.count({ where: { phone } })).toBe(0);
    expect((await login(temporaryPassword, randomUUID())).statusCode).toBe(401);
    expect((await login(password)).statusCode).toBe(200);

    const upgraded = await owner.request("PATCH", detail, { role: "MANAGER" });
    expect(upgraded.statusCode).toBe(200);
    expect(
      restaurantStaffMemberSchema.parse(upgraded.json()).passwordChangeRequired,
    ).toBe(false);
    await expect(tokens.verify(session.accessToken)).rejects.toMatchObject({
      statusCode: 401,
      code: "UNAUTHENTICATED",
    });
    const refreshed = await api.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: session.refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    const updatedSession = authTokensSchema.parse(refreshed.json());
    expect(await tokens.verify(updatedSession.accessToken)).toMatchObject({
      role: "MANAGER",
    });

    expect((await owner.request("DELETE", detail)).statusCode).toBe(204);
    expect((await login(password)).statusCode).toBe(401);
    expect(
      (await authenticated(test, updatedSession.accessToken)("GET", staffPath))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await api.inject({
          method: "POST",
          url: "/auth/refresh",
          payload: { refreshToken: updatedSession.refreshToken },
        })
      ).statusCode,
    ).toBe(401);
  } finally {
    await api.close();
  }
}, 25_000);

it("rejects use of both token types for a staff account whose temporary password remains active", async () => {
  const test = openAuthTest();
  try {
    const owner = await ownerFixture(test, "+963900000095");
    const employee = await restaurantUser(
      test,
      "+963900000096",
      "MANAGER",
      owner.restaurantId,
      true,
    );
    const session = await test.tokens.issue({
      aud: "restaurant",
      sub: employee.id,
      restaurantId: owner.restaurantId,
      role: "MANAGER",
    });
    expect(
      (await authenticated(test, session.accessToken)("GET", staffPath))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await test.api.inject({
          method: "POST",
          url: "/auth/refresh",
          payload: { refreshToken: session.refreshToken },
        })
      ).statusCode,
    ).toBe(401);
  } finally {
    await test.api.close();
  }
}, 15_000);
