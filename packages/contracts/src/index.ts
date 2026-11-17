export * from "./auth.js";
export * from "./geo.js";
export * from "./media.js";
export * from "./menu-actions.js";
export * from "./menu-catalog.js";
export * from "./menu-options.js";
export * from "./restaurant.js";
export * from "./staff.js";

import { z } from "zod";

export const errorCodes = [
  "ACCOUNT_UNAVAILABLE",
  "CONFLICT",
  "DATABASE_UNAVAILABLE",
  "FORBIDDEN",
  "INTERNAL_ERROR",
  "INVALID_CREDENTIALS",
  "INVALID_OTP",
  "INVALID_REFRESH_TOKEN",
  "NOT_FOUND",
  "OTP_UNAVAILABLE",
  "PASSWORD_CHANGE_REQUIRED",
  "RATE_LIMITED",
  "UNAUTHENTICATED",
  "VALIDATION_ERROR",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(errorCodes),
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),
});
