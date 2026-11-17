import type { FastifyInstance } from "fastify";
import { requireRestaurant, requireRestaurantRole } from "../auth/access.js";
import { browseCurrencyMode } from "../browse/shared.js";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { readOrderTimings } from "../orders/settings.js";

export function registerRestaurantSessionRoute(
  api: FastifyInstance,
  { db, now }: { db: PrismaClient; now: () => Date },
) {
  api.get("/restaurant/session", { preHandler: requireRestaurantRole("OWNER", "MANAGER", "CASHIER", "KITCHEN") }, async (request, reply) => {
    const { role, restaurantId } = requireRestaurant(request);
    const [currencyDisplayMode, { expireAfterSec }, restaurant] = await Promise.all([
      browseCurrencyMode(db),
      readOrderTimings(db),
      db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { status: true, branch: { select: { acceptingOrders: true } } } }),
    ]);
    return reply.header("Cache-Control", "no-store").send({
      restaurantId,
      role,
      restaurantStatus: restaurant.status,
      currencyDisplayMode,
      expireAfterSec,
      serverTime: now().toISOString(),
      acceptingOrders: restaurant.branch?.acceptingOrders ?? false,
    });
  });
}
