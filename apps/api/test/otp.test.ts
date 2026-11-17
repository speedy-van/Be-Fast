import { describe, expect, it } from "vitest";
import { openAuthTest } from "./auth-test-support.js";

const otpTestTimeoutMs = 30_000;
const minuteMs = 60_000;

type AuthTest = Awaited<ReturnType<typeof openAuthTest>>;

async function withAuthTest(run: (fixture: AuthTest) => Promise<void>) {
  const fixture = await openAuthTest();
  try {
    await run(fixture);
  } finally {
    await fixture.api.close();
  }
}

function requestOtp(
  { api }: AuthTest,
  phone: string,
  remoteAddress: string,
  audience: "customer" | "restaurant" = "customer",
) {
  return api.inject({
    method: "POST",
    url: `/auth/${audience}/otp/request`,
    payload: { phone },
    remoteAddress,
  });
}

function verifyOtp(
  { api }: AuthTest,
  phone: string,
  code: string,
  remoteAddress: string,
) {
  return api.inject({
    method: "POST",
    url: "/auth/customer/otp/verify",
    payload: { phone, code },
    remoteAddress,
  });
}

function sentCode({ otpCodes }: AuthTest, phone: string): string {
  const code = otpCodes.get(phone);
  if (!code) throw new Error("The test provider did not receive the OTP.");
  expect(/^\d{6}$/u.test(code)).toBe(true);
  return code;
}

function advance({ clock }: AuthTest, milliseconds: number) {
  clock.now = new Date(clock.now.getTime() + milliseconds);
}

describe("one-time passcodes", () => {
  it(
    "stores only a hash and invalidates the OTP after five wrong attempts",
    () =>
      withAuthTest(async (fixture) => {
        const phone = "+963955300001";
        const ip = "192.0.2.1";
        expect((await requestOtp(fixture, phone, ip)).statusCode).toBe(204);
        const code = sentCode(fixture, phone);
        const challenge = await fixture.db.otpChallenge.findFirstOrThrow({
          where: { phone },
        });
        expect(challenge.codeHash === code).toBe(false);
        expect(/^[a-f0-9]{64}$/u.test(challenge.codeHash)).toBe(true);

        const wrongCode = code === "000000" ? "111111" : "000000";
        for (let attempt = 0; attempt < 5; attempt++) {
          const response = await verifyOtp(fixture, phone, wrongCode, ip);
          expect(response.statusCode).toBe(401);
          expect(response.json().error.code).toBe("INVALID_OTP");
        }
        expect((await verifyOtp(fixture, phone, code, ip)).statusCode).toBe(
          401,
        );
        expect(
          (
            await fixture.db.otpChallenge.findUniqueOrThrow({
              where: { id: challenge.id },
            })
          ).attempts,
        ).toBe(5);
        expect(await fixture.db.customer.count({ where: { phone } })).toBe(0);
      }),
    otpTestTimeoutMs,
  );

  it(
    "rejects an OTP at exactly five minutes",
    () =>
      withAuthTest(async (fixture) => {
        const phone = "+963955300002";
        const ip = "192.0.2.2";
        expect((await requestOtp(fixture, phone, ip)).statusCode).toBe(204);
        advance(fixture, 5 * minuteMs);

        const response = await verifyOtp(
          fixture,
          phone,
          sentCode(fixture, phone),
          ip,
        );
        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("INVALID_OTP");
        expect(await fixture.db.customer.count({ where: { phone } })).toBe(0);
      }),
    otpTestTimeoutMs,
  );

  it(
    "consumes an OTP once even when the two verifications are concurrent",
    () =>
      withAuthTest(async (fixture) => {
        const phone = "+963955300003";
        const ip = "192.0.2.3";
        expect((await requestOtp(fixture, "0955300003", ip)).statusCode).toBe(
          204,
        );
        const code = sentCode(fixture, phone);
        const results = await Promise.all([
          verifyOtp(fixture, phone, code, ip),
          verifyOtp(fixture, "00963955300003", code, ip),
        ]);
        expect(results.map(({ statusCode }) => statusCode).sort()).toEqual([
          200, 401,
        ]);
        const success = results.find(({ statusCode }) => statusCode === 200);
        expect(typeof success?.json().accessToken).toBe("string");
        expect(typeof success?.json().refreshToken).toBe("string");
        expect(await fixture.db.customer.count({ where: { phone } })).toBe(1);
      }),
    otpTestTimeoutMs,
  );

  it(
    "returns 429 on the sixth OTP request for the phone within an hour",
    () =>
      withAuthTest(async (fixture) => {
        const phone = "+963955300004";
        const ip = "192.0.2.4";
        for (let issued = 0; issued < 5; issued++) {
          expect((await requestOtp(fixture, phone, ip)).statusCode).toBe(204);
          advance(fixture, minuteMs);
        }

        const response = await requestOtp(fixture, phone, ip);
        expect(response.statusCode).toBe(429);
        expect(response.json().error.code).toBe("RATE_LIMITED");
        expect(await fixture.db.otpChallenge.count({ where: { phone } })).toBe(
          5,
        );

        advance(fixture, 55 * minuteMs);
        expect((await requestOtp(fixture, phone, ip)).statusCode).toBe(204);
      }),
    otpTestTimeoutMs,
  );

  it(
    "enforces 60 seconds between sends across equivalent phone formats and purposes",
    () =>
      withAuthTest(async (fixture) => {
        const phone = "+963955300005";
        const ip = "192.0.2.5";
        expect((await requestOtp(fixture, "0955300005", ip)).statusCode).toBe(
          204,
        );
        advance(fixture, minuteMs - 1);
        expect(
          (await requestOtp(fixture, phone, ip, "restaurant")).statusCode,
        ).toBe(429);
        advance(fixture, 1);
        expect(
          (await requestOtp(fixture, phone, ip, "restaurant")).statusCode,
        ).toBe(204);
        expect(await fixture.db.otpChallenge.count({ where: { phone } })).toBe(
          2,
        );
      }),
    otpTestTimeoutMs,
  );

  it(
    "returns 429 on the twenty-first code request across phone numbers for one IP",
    () =>
      withAuthTest(async (fixture) => {
        const ip = "192.0.2.6";
        const createdAt = fixture.clock.now;
        await fixture.db.otpChallenge.createMany({
          data: Array.from({ length: 19 }, (_, index) => ({
            phone: `+963955380${String(index).padStart(3, "0")}`,
            purpose: "CUSTOMER_LOGIN",
            ip,
            codeHash: "0".repeat(64),
            createdAt,
            expiresAt: new Date(createdAt.getTime() + 5 * minuteMs),
          })),
        });
        expect(
          (await requestOtp(fixture, "+963955300006", ip)).statusCode,
        ).toBe(204);
        const response = await requestOtp(
          fixture,
          "+963955300007",
          ip,
          "restaurant",
        );
        expect(response.statusCode).toBe(429);
        expect(response.json().error.code).toBe("RATE_LIMITED");
        expect(await fixture.db.otpChallenge.count({ where: { ip } })).toBe(20);
      }),
    otpTestTimeoutMs,
  );

  it(
    "issues one OTP for simultaneous sends to the same phone from different IPs",
    () =>
      withAuthTest(async (fixture) => {
        const phone = "+963955300008";
        const results = await Promise.all([
          requestOtp(fixture, phone, "192.0.2.8"),
          requestOtp(fixture, phone, "192.0.2.9"),
        ]);
        expect(results.map(({ statusCode }) => statusCode).sort()).toEqual([
          204, 429,
        ]);
        expect(await fixture.db.otpChallenge.count({ where: { phone } })).toBe(
          1,
        );
      }),
    otpTestTimeoutMs,
  );

  it(
    "rejects restaurant OTPs at the customer verification endpoint",
    () =>
      withAuthTest(async (fixture) => {
        const phone = "+963955300009";
        const ip = "192.0.2.10";
        expect(
          (await requestOtp(fixture, phone, ip, "restaurant")).statusCode,
        ).toBe(204);
        const response = await verifyOtp(
          fixture,
          phone,
          sentCode(fixture, phone),
          ip,
        );
        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("INVALID_OTP");
        expect(await fixture.db.customer.count({ where: { phone } })).toBe(0);
      }),
    otpTestTimeoutMs,
  );
});
