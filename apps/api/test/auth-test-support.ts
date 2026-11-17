import { randomBytes } from "node:crypto";
import { inject } from "vitest";
import {
  createApi,
  createDatabaseClient,
  type ApiOptions,
} from "../src/app.js";
import { createTokenService } from "../src/auth/tokens.js";

export function openAuthTest(
  options: {
    logger?: ApiOptions["logger"];
    developmentOtp?: boolean;
  } = {},
) {
  const test = inject("testDatabase");
  const db = createDatabaseClient(test.url, test.schema);
  const clock = { now: new Date("2026-11-17T09:00:00.000Z") };
  const now = () => clock.now;
  const secret = randomBytes(32);
  const otpCodes = new Map<string, string>();
  const tokens = createTokenService({ db, secret, now });
  const api = createApi(test.url, {
    databaseSchema: test.schema,
    logger: options.logger,
    auth: {
      secret,
      now,
      developmentOtp: options.developmentOtp,
      otpProvider: options.developmentOtp
        ? undefined
        : {
            async send(phone, code) {
              otpCodes.set(phone, code);
            },
          },
    },
  });
  api.addHook("onClose", () => db.$disconnect());
  return { api, db, clock, otpCodes, tokens };
}
