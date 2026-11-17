import { TERMINAL_STATES } from "@be-fast/domain";
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../auth/access.js";
import { browseAvailability, browseCurrencyMode } from "../browse/shared.js";
import type { PrismaClient } from "../generated/prisma/client.ts";

async function orderCounts(db: PrismaClient) {
  const counts = await db.order.groupBy({
    by: ["status", "needsAttention"],
    where: { status: { notIn: [...TERMINAL_STATES] } },
    _count: { _all: true },
  });
  return {
    activeOrderCount: counts.reduce((sum, group) => sum + group._count._all, 0),
    needsAttentionCount: counts.reduce(
      (sum, group) =>
        group.status === "PENDING" && group.needsAttention
          ? sum + group._count._all
          : sum,
      0,
    ),
  };
}

async function offlineBranchList(db: PrismaClient, now: Date) {
  const branches = await db.branch.findMany({
    where: { acceptingOrders: true, restaurant: { status: "APPROVED" } },
    select: {
      id: true,
      restaurantId: true,
      restaurant: { select: { name: true } },
      acceptingOrders: true,
      lastSeenAt: true,
      openingPeriods: {
        select: { dayOfWeek: true, opensAt: true, closesAt: true },
      },
    },
    orderBy: [{ lastSeenAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
  });
  return branches
    .filter(
      (branch) => browseAvailability(branch, true, now).reason === "OFFLINE",
    )
    .map(({ id, restaurantId, restaurant, lastSeenAt }) => ({
      id,
      restaurantId,
      restaurantName: restaurant.name,
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
    }));
}

export function registerAdminDashboardRoutes(
  api: FastifyInstance,
  { db, now }: { db: PrismaClient; now: () => Date },
) {
  api.get("/admin/session", async (request, reply) => {
    const { sub: id, role } = requireAdmin(request);
    const currencyDisplayMode = await browseCurrencyMode(db);
    return reply
      .header("Cache-Control", "no-store")
      .send({ id, role, currencyDisplayMode });
  });

  api.get("/admin/dashboard", async (request, reply) => {
    const { role } = requireAdmin(request);
    const mayReadOrders = role !== "FINANCE";
    const mayReadRestaurants = role === "SUPER_ADMIN" || role === "OPERATIONS";
    const [orders, pendingRestaurantCount, offlineBranches] = await Promise.all(
      [
        mayReadOrders ? orderCounts(db) : null,
        mayReadRestaurants
          ? db.restaurant.count({ where: { status: "PENDING_REVIEW" } })
          : null,
        mayReadRestaurants ? offlineBranchList(db, now()) : null,
      ],
    );
    return reply.header("Cache-Control", "no-store").send({
      activeOrderCount: orders?.activeOrderCount ?? null,
      needsAttentionCount: orders?.needsAttentionCount ?? null,
      pendingRestaurantCount,
      offlineBranches,
    });
  });
}
