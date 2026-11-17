export * from "./auth.js";
export * from "./browse-detail.js";
export * from "./browse-list.js";
export * from "./customer-addresses.js";
export * from "./geo.js";
export * from "./media.js";
export * from "./menu-actions.js";
export * from "./menu-catalog.js";
export * from "./menu-options.js";
export * from "./order-complaint.js";
export * from "./order-create.js";
export * from "./order-read.js";
export * from "./order-transition.js";
export * from "./restaurant.js";
export * from "./staff.js";

import { z } from "zod";

export const errorCodes = [
  "ACCOUNT_UNAVAILABLE",
  "BELOW_MINIMUM",
  "CONFLICT",
  "DATABASE_UNAVAILABLE",
  "FORBIDDEN",
  "INTERNAL_ERROR",
  "INVALID_CREDENTIALS",
  "INVALID_OTP",
  "INVALID_OPTIONS",
  "INVALID_REFRESH_TOKEN",
  "INVALID_TRANSITION",
  "ITEM_UNAVAILABLE",
  "NOT_FOUND",
  "OTP_UNAVAILABLE",
  "OUT_OF_ZONE",
  "PASSWORD_CHANGE_REQUIRED",
  "PRICE_CHANGED",
  "RATE_LIMITED",
  "RESTAURANT_CLOSED",
  "TOO_MANY_ACTIVE_ORDERS",
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
