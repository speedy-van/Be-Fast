import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";

const loginRoutes = new Set([
  "/auth/admin/login",
  "/auth/customer/otp/verify",
  "/auth/restaurant/login",
  "/auth/restaurant/register",
]);
const minuteMs = 60_000;
const loginLimit = 10;
const publicLimit = 120;

export function registerRateLimits(api: FastifyInstance, now: () => Date) {
  const windows = new Map<string, { count: number; expiresAt: number }>();
  let nextCleanup = 0;

  api.addHook("onRequest", async (request, reply) => {
    const route = request.routeOptions.url;
    const isPublic = route?.startsWith("/public/") ?? false;
    if (!isPublic && (!route || !loginRoutes.has(route))) return;

    const current = now().getTime();
    if (current >= nextCleanup) {
      for (const [key, window] of windows) {
        if (window.expiresAt <= current) windows.delete(key);
      }
      nextCleanup = current + minuteMs;
    }

    const key = `${isPublic ? "/public" : route}:${request.ip}`;
    const existing = windows.get(key);
    if (!existing || existing.expiresAt <= current) {
      windows.set(key, { count: 1, expiresAt: current + minuteMs });
      return;
    }

    if (existing.count >= (isPublic ? publicLimit : loginLimit)) {
      const retryAfterSec = Math.ceil((existing.expiresAt - current) / 1_000);
      reply.header("Retry-After", retryAfterSec);
      throw new ApiError(429, "RATE_LIMITED", { retryAfterSec });
    }
    existing.count++;
  });
}
