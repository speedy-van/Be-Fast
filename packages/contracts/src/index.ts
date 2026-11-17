export * from "./auth.js";
export * from "./geo.js";
export * from "./media.js";
export * from "./restaurant.js";

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
