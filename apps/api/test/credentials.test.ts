import { randomUUID } from "node:crypto";
import { authTokensSchema, errorEnvelopeSchema } from "@be-fast/contracts";
import { generate, generateSecret } from "otplib";
import { expect, it } from "vitest";
import { createAdmin } from "../prisma/admin-create.ts";
import { openAuthTest } from "./auth-test-support.js";

it("registers one owner and draft branch through an OTP, then signs in by password", async () => {
  const { api, db, otpCodes, tokens } = openAuthTest();
  const phone = "+963900000070";
  const password = randomUUID();
  const settingKey = "commission.defaultRateBps";
  const initialSetting = await db.platformSetting.findUnique({
    where: { key: settingKey },
  });
  await db.platformSetting.upsert({
    where: { key: settingKey },
    create: { key: settingKey, value: 1_234 },
    update: { value: 1_234 },
  });

  try {
    const requested = await api.inject({
      method: "POST",
      url: "/auth/restaurant/otp/request",
      payload: { phone: "0900000070" },
    });
    expect(requested.statusCode).toBe(204);
    const code = otpCodes.get(phone);
    if (code === undefined)
      throw new Error("The registration OTP was not delivered.");

    function register(otpCode: string) {
      return api.inject({
        method: "POST",
        url: "/auth/restaurant/register",
        payload: { phone, password, code: otpCode },
      });
    }
    const invalid = await register(code === "000000" ? "000001" : "000000");
    expect(invalid.statusCode).toBe(401);
    expect(errorEnvelopeSchema.parse(invalid.json()).error.code).toBe(
      "INVALID_OTP",
    );
    expect(await db.restaurantUser.count({ where: { phone } })).toBe(0);

    const registered = await register(code);
    expect(registered.statusCode).toBe(201);
    expect(registered.headers["cache-control"]).toBe("no-store");
    const owner = await db.restaurantUser.findUniqueOrThrow({
      where: { phone },
      select: {
        id: true,
        passwordHash: true,
        restaurant: {
          select: {
            id: true,
            status: true,
            commissionRateBps: true,
            branch: { select: { id: true } },
          },
        },
      },
    });
    expect(owner.passwordHash.startsWith("$argon2id$v=19$")).toBe(true);
    expect(owner.passwordHash === password).toBe(false);
    expect(owner.restaurant.status).toBe("DRAFT");
    expect(owner.restaurant.commissionRateBps).toBe(1_234);
    expect(owner.restaurant.branch?.id).toBeDefined();
    const principal = {
      aud: "restaurant",
      sub: owner.id,
      restaurantId: owner.restaurant.id,
      role: "OWNER",
    };
    const registeredTokens = authTokensSchema.parse(registered.json());
    expect(await tokens.verify(registeredTokens.accessToken)).toEqual(
      principal,
    );
    expect((await register(code)).statusCode).toBe(401);
    expect(await db.restaurantUser.count({ where: { phone } })).toBe(1);

    function login(suppliedPassword: string) {
      return api.inject({
        method: "POST",
        url: "/auth/restaurant/login",
        payload: { phone: "00963900000070", password: suppliedPassword },
      });
    }
    const rejected = await login(randomUUID());
    expect(rejected.statusCode).toBe(401);
    expect(errorEnvelopeSchema.parse(rejected.json()).error.code).toBe(
      "INVALID_CREDENTIALS",
    );
    const signedIn = await login(password);
    expect(signedIn.statusCode).toBe(200);
    const signedInTokens = authTokensSchema.parse(signedIn.json());
    expect(await tokens.verify(signedInTokens.accessToken)).toEqual(principal);

    await db.restaurantUser.update({
      where: { id: owner.id },
      data: { isActive: false },
    });
    expect((await login(password)).statusCode).toBe(401);
  } finally {
    try {
      if (initialSetting !== null) {
        await db.$executeRaw`UPDATE "PlatformSetting" SET "value" = ${JSON.stringify(initialSetting.value)}::jsonb WHERE "key" = ${settingKey}`;
      } else {
        await db.platformSetting.delete({ where: { key: settingKey } });
      }
    } finally {
      await api.close();
    }
  }
}, 20_000);

it("provisions a super admin and requires a fresh TOTP time step for every login", async () => {
  const { api, db, clock, tokens } = openAuthTest();
  const email = `${randomUUID()}@be-fast.example`;
  const password = randomUUID();
  const secret = generateSecret();
  try {
    await createAdmin(db, {
      email: email.toUpperCase(),
      password,
      totpSecret: secret,
    });
    const admin = await db.adminUser.findUniqueOrThrow({
      where: { email },
      select: { id: true, role: true, lastTotpTimeStep: true },
    });
    expect(admin.role).toBe("SUPER_ADMIN");
    expect(admin.lastTotpTimeStep).toBeNull();
    await expect(
      createAdmin(db, { email, password, totpSecret: secret }),
    ).rejects.toThrow("already exists");

    function login(totp?: string, suppliedPassword = password) {
      return api.inject({
        method: "POST",
        url: "/auth/admin/login",
        payload: {
          email: email.toUpperCase(),
          password: suppliedPassword,
          totp,
        },
      });
    }
    const epoch = Math.floor(clock.now.getTime() / 1_000);
    const codes = await Promise.all(
      [-30, 0, 30].map((delta) => generate({ secret, epoch: epoch + delta })),
    );
    const code = codes[1];
    const wrongCode = ["000000", "000001", "000002", "000003"].find(
      (value) => !codes.includes(value),
    );
    if (code === undefined || wrongCode === undefined)
      throw new Error("Could not prepare test TOTP values.");

    expect((await login()).statusCode).toBe(400);
    expect((await login(code, randomUUID())).statusCode).toBe(401);
    expect((await login(wrongCode)).statusCode).toBe(401);
    const attempts = await Promise.all([login(code), login(code)]);
    expect(attempts.map(({ statusCode }) => statusCode).sort()).toEqual([
      200, 401,
    ]);
    const firstSession = attempts.find(({ statusCode }) => statusCode === 200);
    if (!firstSession)
      throw new Error("The first use of the TOTP was rejected.");
    expect(firstSession.headers["cache-control"]).toBe("no-store");
    const firstTokens = authTokensSchema.parse(firstSession.json());
    expect(await tokens.verify(firstTokens.accessToken)).toEqual({
      aud: "admin",
      sub: admin.id,
      role: "SUPER_ADMIN",
    });
    expect(
      await db.refreshToken.count({ where: { adminUserId: admin.id } }),
    ).toBe(1);

    clock.now = new Date(clock.now.getTime() + 30_000);
    const nextCode = await generate({ secret, epoch: epoch + 30 });
    expect((await login(nextCode)).statusCode).toBe(200);
    expect(
      await db.refreshToken.count({ where: { adminUserId: admin.id } }),
    ).toBe(2);
    const updated = await db.adminUser.findUniqueOrThrow({
      where: { email },
      select: { lastTotpTimeStep: true },
    });
    expect(updated.lastTotpTimeStep).toBe(
      BigInt(Math.floor((epoch + 30) / 30)),
    );
  } finally {
    await api.close();
  }
}, 20_000);
