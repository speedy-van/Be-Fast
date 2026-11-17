import { Writable } from "node:stream";
import { authTokensSchema, errorEnvelopeSchema } from "@be-fast/contracts";
import { messages } from "@be-fast/i18n";
import { expect, it } from "vitest";
import { openAuthTest } from "./auth-test-support.js";

const testTimeoutMs = 20_000;

it("normalizes route parameters rejected before a handler runs", async () => {
  const { api } = openAuthTest();
  try {
    const response = await api.inject({
      url: `/public/restaurants/${"a".repeat(150)}`,
    });
    expect(response.statusCode).toBe(414);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: messages.errors.validationError,
        details: {},
      },
    });
  } finally {
    await api.close();
  }
});

it(
  "keeps full phones, passwords and login tokens out of application logs",
  async () => {
    let output = "";
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        output += chunk.toString("utf8");
        callback();
      },
    });
    const { api } = openAuthTest({ logger: { stream }, developmentOtp: true });
    const phone = "+963900310001";
    const password = "private-log-test-password";
    try {
      api.get("/customer/log-check", async () => {
        throw new Error(`Internal failure mentioning ${phone} and ${password}`);
      });
      const otpResponse = await api.inject({
        method: "POST",
        url: "/auth/customer/otp/request",
        payload: { phone },
      });
      expect(otpResponse.statusCode).toBe(204);
      const otp = /"code":"([0-9]{6})"/u.exec(output)?.[1];
      expect(typeof otp).toBe("string");

      const verifyResponse = await api.inject({
        method: "POST",
        url: "/auth/customer/otp/verify",
        payload: { phone, code: otp },
      });
      expect(verifyResponse.statusCode).toBe(200);
      const tokens = authTokensSchema.parse(verifyResponse.json());
      const loginResponse = await api.inject({
        method: "POST",
        url: "/auth/restaurant/login",
        payload: { phone, password },
      });
      expect(loginResponse.statusCode).toBe(401);

      const failure = await api.inject({
        method: "GET",
        url: `/customer/log-check?token=${tokens.refreshToken}`,
        headers: { authorization: `Bearer ${tokens.accessToken}` },
      });
      expect(failure.statusCode).toBe(500);
      expect(errorEnvelopeSchema.parse(failure.json()).error.code).toBe(
        "INTERNAL_ERROR",
      );
      expect(output.includes("Unhandled request error.")).toBe(true);
      for (const privateValue of [
        phone,
        password,
        tokens.accessToken,
        tokens.refreshToken,
      ]) {
        expect(output.includes(privateValue)).toBe(false);
      }
    } finally {
      await api.close();
    }
  },
  testTimeoutMs,
);

it(
  "validates auth input and throttles login retries by IP",
  async () => {
    const { api, clock } = openAuthTest();
    const login = (remoteAddress: string) =>
      api.inject({
        method: "POST",
        url: "/auth/restaurant/login",
        remoteAddress,
        payload: { phone: "not-a-phone", password: "valid-length" },
      });
    try {
      for (let attempt = 0; attempt < 10; attempt++) {
        const response = await login("192.0.2.11");
        expect(response.statusCode).toBe(400);
        expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe(
          "VALIDATION_ERROR",
        );
      }
      const limited = await login("192.0.2.11");
      expect(limited.statusCode).toBe(429);
      expect(limited.headers["retry-after"]).toBe("60");
      expect(errorEnvelopeSchema.parse(limited.json()).error.code).toBe(
        "RATE_LIMITED",
      );
      expect((await login("192.0.2.12")).statusCode).toBe(400);
      clock.now = new Date(clock.now.getTime() + 60_000);
      expect((await login("192.0.2.11")).statusCode).toBe(400);
    } finally {
      await api.close();
    }
  },
  testTimeoutMs,
);

it(
  "applies one public rate budget per IP across public routes",
  async () => {
    const { api } = openAuthTest();
    try {
      api.get("/public/first", async () => ({ ok: true }));
      api.get("/public/second", async () => ({ ok: true }));
      for (let attempt = 0; attempt < 120; attempt++) {
        const response = await api.inject({
          url: "/public/first",
          remoteAddress: "192.0.2.21",
        });
        expect(response.statusCode).toBe(200);
      }
      expect(
        (
          await api.inject({
            url: "/public/second",
            remoteAddress: "192.0.2.21",
          })
        ).statusCode,
      ).toBe(429);
      expect(
        (
          await api.inject({
            url: "/public/second",
            remoteAddress: "192.0.2.22",
          })
        ).statusCode,
      ).toBe(200);
    } finally {
      await api.close();
    }
  },
  testTimeoutMs,
);

it(
  "keeps client rate budgets separate behind the configured local proxy",
  async () => {
    const { api } = openAuthTest({ trustLocalProxy: true });
    const login = (forwarded: string) =>
      api.inject({
        method: "POST",
        url: "/auth/admin/login",
        remoteAddress: "127.0.0.1",
        headers: { "x-forwarded-for": forwarded },
        payload: {},
      });
    try {
      for (let attempt = 0; attempt < 10; attempt++) {
        expect((await login("192.0.2.31")).statusCode).toBe(400);
      }
      expect((await login("192.0.2.31")).statusCode).toBe(429);
      expect((await login("192.0.2.32")).statusCode).toBe(400);
    } finally {
      await api.close();
    }
  },
  testTimeoutMs,
);
