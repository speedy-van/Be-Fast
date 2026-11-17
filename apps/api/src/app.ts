import { createHmac } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import Fastify, {
  LogController,
  type FastifyServerOptions,
  type RouteOptions,
} from "fastify";
import { Pool } from "pg";
import { registerAdminAuditRoutes } from "./admin/audit-routes.js";
import { registerAdminCustomerRoutes } from "./admin/customer-routes.js";
import { registerAdminDashboardRoutes } from "./admin/dashboard-routes.js";
import { registerAdminSettingsRoutes } from "./admin/settings-routes.js";
import { registerAdminStaffRoutes } from "./admin/staff-routes.js";
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
import { registerBrowseDetailRoutes } from "./browse/detail-routes.js";
import { registerBrowseListRoutes } from "./browse/list-routes.js";
import { registerCustomerAccountRoutes } from "./customer/account-routes.js";
import { registerCustomerAddressRoutes } from "./customer/address-routes.js";
import { ApiError, handleApiError, registerErrorHandlers } from "./errors.js";
import { registerFinanceLedgerRoutes } from "./finance/ledger-routes.js";
import { registerOrderMetricsRoutes } from "./finance/order-metrics-routes.js";
import { registerRestaurantReportRoutes } from "./finance/restaurant-report-routes.js";
import { PrismaClient } from "./generated/prisma/client.ts";
import { registerGeoRoutes } from "./geo/routes.js";
import { registerMenuActionRoutes } from "./menu/action-routes.js";
import { registerMenuCatalogRoutes } from "./menu/catalog-routes.js";
import { registerMenuOptionRoutes } from "./menu/option-routes.js";
import { registerComplaintRoutes } from "./orders/complaint-routes.js";
import { registerOrderCreateRoute } from "./orders/create-route.js";
import { startOrderJobs } from "./orders/jobs.js";
import { DevPushProvider, type PushProvider } from "./orders/push.js";
import { registerOrderReadRoutes } from "./orders/read-routes.js";
import { registerOrderTransitionRoutes } from "./orders/transition-routes.js";
import { registerMediaRoutes } from "./restaurant/media-routes.js";
import { registerRestaurantRoutes } from "./restaurant/profile-routes.js";
import { registerRestaurantSessionRoute } from "./restaurant/session-route.js";
import { registerStaffRoutes } from "./restaurant/staff-routes.js";
import { createLocalStorage } from "./storage-config.js";
import type { StorageProvider } from "./storage/provider.js";

export interface ApiOptions {
  databaseSchema?: string;
  logger?: FastifyServerOptions["logger"];
  trustLocalProxy?: boolean;
  storage?: StorageProvider;
  onQuery?: (query: string) => void;
  onRoute?: (route: Pick<RouteOptions, "method" | "url">) => void;
  push?: PushProvider;
  orderJobs?: boolean;
  auth?: {
    secret: Uint8Array;
    now?: () => Date;
    otpProvider?: OtpProvider;
    developmentOtp?: boolean;
  };
}

export function createDatabaseClient(
  databaseUrl: string,
  schema?: string,
  onQuery?: ApiOptions["onQuery"],
) {
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
  const db = new PrismaClient({
    adapter,
    log: onQuery ? [{ emit: "event", level: "query" }] : [],
    transactionOptions: {
      isolationLevel: "ReadCommitted",
      maxWait: 10_000,
      timeout: 10_000,
    },
  });
  if (onQuery) db.$on("query", ({ query }) => onQuery(query));
  return db;
}

export function createApi(databaseUrl: string, options: ApiOptions = {}) {
  const api = Fastify({
    logger: options.logger,
    trustProxy: options.trustLocalProxy ? "loopback" : false,
    frameworkErrors: handleApiError,
    logController: new LogController({ disableRequestLogging: true }),
  });
  if (options.onRoute) api.addHook("onRoute", options.onRoute);
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
    const db = createDatabaseClient(
      databaseUrl,
      options.databaseSchema,
      options.onQuery,
    );
    let stopJobs: (() => Promise<void>) | undefined;
    api.addHook("onClose", async () => {
      try {
        await stopJobs?.();
      } finally {
        await db.$disconnect();
      }
    });

    const push = options.push ?? new DevPushProvider(api.log);
    if (options.orderJobs) {
      api.addHook("onReady", async () => {
        stopJobs = await startOrderJobs({
          db,
          now,
          push,
          logger: api.log,
          databaseUrl,
          schema: "be_fast_jobs",
        });
      });
    }

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
    registerAdminAuditRoutes(api, db);
    registerAdminCustomerRoutes(api, { db, now });
    registerAdminDashboardRoutes(api, { db, now });
    registerAdminSettingsRoutes(api, db);
    registerAdminStaffRoutes(api, db);
    registerOtpRoutes(api, { db, otp, tokens });
    registerCredentialRoutes(api, { db, otp, tokens, now });
    registerTokenRoutes(api, { tokens });
    registerOrderCreateRoute(api, { db, now, push });
    registerOrderReadRoutes(api, { db, now });
    registerOrderMetricsRoutes(api, db);
    registerFinanceLedgerRoutes(api, db);
    registerRestaurantReportRoutes(api, { db });
    registerComplaintRoutes(api, { db, now });
    registerOrderTransitionRoutes(api, { db, now, push });
    registerCustomerAddressRoutes(api, { db });
    registerCustomerAccountRoutes(api, { db, now });
    registerBrowseListRoutes(api, { db, now });
    registerBrowseDetailRoutes(api, { db, now });
    registerGeoRoutes(api, { db });
    registerRestaurantRoutes(api, { db });
    registerRestaurantSessionRoute(api, { db, now });
    registerMenuCatalogRoutes(api, { db });
    registerMenuOptionRoutes(api, { db });
    registerMenuActionRoutes(api, { db });
    registerStaffRoutes(api, { db });
    registerMediaRoutes(api, {
      db,
      now,
      storage: options.storage ?? createLocalStorage(),
      secret: createHmac("sha256", secret)
        .update("be-fast:document-links")
        .digest(),
    });
  }

  return api;
}
