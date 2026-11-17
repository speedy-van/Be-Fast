import type { ErrorCode } from "@be-fast/contracts";
import { messages } from "@be-fast/i18n";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

const errorMessages = {
  ACCOUNT_UNAVAILABLE: messages.errors.accountUnavailable,
  ACTIVE_ORDERS: messages.errors.activeOrders,
  BELOW_MINIMUM: messages.errors.belowMinimum,
  CONFLICT: messages.errors.conflict,
  DATABASE_UNAVAILABLE: messages.errors.databaseUnavailable,
  FORBIDDEN: messages.errors.forbidden,
  INTERNAL_ERROR: messages.errors.internalError,
  INVALID_CREDENTIALS: messages.errors.invalidCredentials,
  INVALID_OTP: messages.errors.invalidOtp,
  INVALID_OPTIONS: messages.errors.invalidOptions,
  INVALID_REFRESH_TOKEN: messages.errors.invalidRefreshToken,
  INVALID_TRANSITION: messages.errors.invalidTransition,
  ITEM_UNAVAILABLE: messages.errors.itemUnavailable,
  NOT_FOUND: messages.errors.pageNotFound,
  OTP_UNAVAILABLE: messages.errors.otpUnavailable,
  OUT_OF_ZONE: messages.errors.outOfZone,
  PASSWORD_CHANGE_REQUIRED: messages.errors.passwordChangeRequired,
  PRICE_CHANGED: messages.errors.priceChanged,
  RATE_LIMITED: messages.errors.rateLimited,
  RESTAURANT_CLOSED: messages.errors.restaurantClosed,
  TOO_MANY_ACTIVE_ORDERS: messages.errors.tooManyActiveOrders,
  UNAUTHENTICATED: messages.errors.unauthenticated,
  VALIDATION_ERROR: messages.errors.validationError,
} satisfies Record<ErrorCode, string>;

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    readonly details: Record<string, unknown> = {},
  ) {
    super(errorMessages[code]);
  }

  envelope() {
    return {
      error: { code: this.code, message: this.message, details: this.details },
    };
  }
}

export function registerErrorHandlers(api: FastifyInstance) {
  api.setNotFoundHandler((_request, reply) => {
    const error = new ApiError(404, "NOT_FOUND");
    return reply.code(error.statusCode).send(error.envelope());
  });

  api.setErrorHandler((error, request, reply) => {
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? error.statusCode
        : undefined;
    let safeError: ApiError;
    if (error instanceof ApiError) {
      safeError = error;
    } else if (error instanceof ZodError) {
      safeError = new ApiError(400, "VALIDATION_ERROR");
    } else if (
      typeof statusCode === "number" &&
      statusCode >= 400 &&
      statusCode < 500
    ) {
      safeError = new ApiError(statusCode, "VALIDATION_ERROR");
    } else {
      request.log.error("Unhandled request error.");
      safeError = new ApiError(500, "INTERNAL_ERROR");
    }
    return reply.code(safeError.statusCode).send(safeError.envelope());
  });
}
