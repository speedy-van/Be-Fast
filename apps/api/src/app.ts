import { createHmac } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import Fastify, { LogController, type FastifyServerOptions } from "fastify";
import { Pool } from "pg";
import { registerAccessGuards } from "./auth/access.js";
import { registerCredentialRoutes } from "./auth/credential-routes.js";
import {
  createOtpService,
  DevOtpProvider,
  type OtpProvider,
} from "./auth/otp.js";
import { registerOtpRoutes } from "./auth/otp-routes.js";
import { registerRateLimits } from "./auth/rate-limits.js";
import { registerTokenRoutes } from "./auth/token-routes.js";
import { createTokenService } from "./auth/tokens.js";
import { ApiError, registerErrorHandlers } from "./errors.js";
import { PrismaClient } from "./generated/prisma/client.ts";

export interface ApiOptions {
  databaseSchema?: string;
  logger?: FastifyServerOptions["logger"];
  auth?: {
    secret: Uint8Array;
    now?: () => Date;
    otpProvider?: OtpProvider;
    developmentOtp?: boolean;
  };
}

export function createDatabaseClient(databaseUrl: string, schema?: string) {
  const adapter = new PrismaPg(
    {
      connectionString: databaseUrl,
      connectionTimeoutMillis: 10_000,
      query_timeout: 10_000,
    },
    {
      schema:
        schema ?? new URL(databaseUrl).searchParams.get("schema") ?? "public",
    },
  );
  return new PrismaClient({
    adapter,
    transactionOptions: {
      isolationLevel: "ReadCommitted",
      maxWait: 10_000,
      timeout: 10_000,
    },
  });
}

export function createApi(databaseUrl: string, options: ApiOptions = {}) {
  const api = Fastify({
    logger: options.logger,
    logController: new LogController({ disableRequestLogging: true }),
  });
  registerErrorHandlers(api);

  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
  });

  pool.on("error", () => {
    api.log.warn("An idle PostgreSQL connection failed.");
  });
  api.addHook("onClose", () => pool.end());

  api.get("/health", async () => {
    try {
      await pool.query("SELECT 1");
    } catch {
      throw new ApiError(503, "DATABASE_UNAVAILABLE");
    }

    return { status: "ok" };
  });

  if (options.auth) {
    const { secret, now = () => new Date() } = options.auth;
    const db = createDatabaseClient(databaseUrl, options.databaseSchema);
    api.addHook("onClose", () => db.$disconnect());

    const provider =
      options.auth.otpProvider ??
      (options.auth.developmentOtp
        ? new DevOtpProvider(api.log)
        : {
            async send() {
              throw new ApiError(503, "OTP_UNAVAILABLE");
            },
          });
    const otpSecret = createHmac("sha256", secret)
      .update("be-fast:auth:otp")
      .digest();
    const otp = createOtpService({ db, secret: otpSecret, now, provider });
    const tokens = createTokenService({ db, secret, now });
    registerRateLimits(api, now);
    registerAccessGuards(api, tokens);
    registerOtpRoutes(api, { db, otp, tokens });
    registerCredentialRoutes(api, { db, otp, tokens, now });
    registerTokenRoutes(api, { tokens });
  }

  return api;
}
