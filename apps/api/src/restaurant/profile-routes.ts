import {
  adminRestaurantListQuerySchema,
  deliveryZoneParamsSchema,
  deliveryZonePatchSchema,
  deliveryZonesSchema,
  openingPeriodsSchema,
  restaurantBranchParamsSchema,
  restaurantBranchSettingsSchema,
  restaurantCommissionSchema,
  restaurantIdParamsSchema,
  restaurantProfilePatchSchema,
  restaurantReviewSchema,
} from "@be-fast/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { writeAdminAudit } from "../audit.js";
import {
  requireAdminRole,
  requireRestaurant,
  requireRestaurantRole,
} from "../auth/access.js";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import type { RestaurantStatus } from "../generated/prisma/enums.ts";

const ownerOnly = { preHandler: requireRestaurantRole("OWNER") };
const branchManagers = {
  preHandler: requireRestaurantRole("OWNER", "MANAGER"),
};
const reviewOperators = {
  preHandler: requireAdminRole("SUPER_ADMIN", "OPERATIONS"),
};
const financeOperators = {
  preHandler: requireAdminRole("SUPER_ADMIN", "FINANCE"),
};

const openingPeriodFields = {
  dayOfWeek: true,
  opensAt: true,
  closesAt: true,
} as const;
const deliveryZoneFields = {
  id: true,
  neighborhoodId: true,
  feeMinor: true,
  etaMinutes: true,
} as const;
const branchFields = {
  id: true,
  neighborhoodId: true,
  address: true,
  latitude: true,
  longitude: true,
  minOrderMinor: true,
  pickupEnabled: true,
  acceptingOrders: true,
} as const;
const restaurantFields = {
  id: true,
  name: true,
  status: true,
  contactPhone: true,
  logoKey: true,
  coverImageKey: true,
  reviewReason: true,
  commissionRateBps: true,
} as const;
const activeNeighborhood = {
  isActive: true,
  city: { isActive: true, governorate: { isActive: true } },
} satisfies Prisma.NeighborhoodWhereInput;

function minorNumber(amount: bigint): number {
  const value = Number(amount);
  if (!Number.isSafeInteger(value)) throw new ApiError(500, "INTERNAL_ERROR");
  return value;
}

function serializeZone(
  zone: Prisma.DeliveryZoneGetPayload<{ select: typeof deliveryZoneFields }>,
) {
  return { ...zone, feeMinor: minorNumber(zone.feeMinor) };
}

function branchScope(restaurantId: string, branchId?: string) {
  return { restaurantId, ...(branchId === undefined ? {} : { id: branchId }) };
}

async function findBranch(db: Prisma.TransactionClient, restaurantId: string) {
  const branch = await db.branch.findUnique({
    where: { restaurantId },
    select: branchFields,
  });
  if (!branch) throw new ApiError(404, "NOT_FOUND");
  return { ...branch, minOrderMinor: minorNumber(branch.minOrderMinor) };
}

async function readRestaurant(
  db: PrismaClient,
  where: Prisma.RestaurantWhereInput,
) {
  const restaurant = await db.restaurant.findFirst({
    where,
    select: {
      ...restaurantFields,
      categories: {
        select: { categoryId: true },
        orderBy: { categoryId: "asc" },
      },
      _count: { select: { documents: true } },
      branch: {
        select: {
          ...branchFields,
          openingPeriods: {
            select: openingPeriodFields,
            orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }],
          },
          deliveryZones: {
            select: deliveryZoneFields,
            orderBy: { neighborhoodId: "asc" },
          },
        },
      },
    },
  });
  if (!restaurant) throw new ApiError(404, "NOT_FOUND");

  const { categories, _count, branch, ...profile } = restaurant;
  return {
    ...profile,
    categoryIds: categories.map(({ categoryId }) => categoryId),
    documentCount: _count.documents,
    branch: branch && {
      ...branch,
      minOrderMinor: minorNumber(branch.minOrderMinor),
      deliveryZones: branch.deliveryZones.map(serializeZone),
    },
  };
}

async function validateNeighborhoods(
  tx: Prisma.TransactionClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const matches = await tx.neighborhood.count({
    where: { id: { in: ids }, ...activeNeighborhood },
  });
  if (matches !== ids.length) throw new ApiError(400, "VALIDATION_ERROR");
}

async function lockRestaurant(tx: Prisma.TransactionClient, id: string) {
  // Updating the modification timestamp acquires the parent row for concurrent review and edits.
  const result = await tx.restaurant.updateMany({
    where: { id },
    data: { updatedAt: new Date() },
  });
  if (result.count !== 1) throw new ApiError(404, "NOT_FOUND");
}

async function lockBranch(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  branchId?: string,
) {
  const result = await tx.branch.updateMany({
    where: branchScope(restaurantId, branchId),
    data: { updatedAt: new Date() },
  });
  if (result.count !== 1) throw new ApiError(404, "NOT_FOUND");
  return findBranch(tx, restaurantId);
}

async function patchProfile(
  db: PrismaClient,
  request: FastifyRequest,
  branchId?: string,
) {
  const { restaurantId } = requireRestaurant(request);
  const {
    name,
    contactPhone,
    categoryIds,
    neighborhoodId,
    address,
    latitude,
    longitude,
  } = restaurantProfilePatchSchema.parse(request.body);

  await db.$transaction(async (tx) => {
    await lockRestaurant(tx, restaurantId);
    const branch = await lockBranch(tx, restaurantId, branchId);
    if (name !== undefined || contactPhone !== undefined) {
      await tx.restaurant.update({
        where: { id: restaurantId },
        data: { name, contactPhone },
      });
    }
    if (categoryIds !== undefined) {
      const matches = await tx.foodCategory.count({
        where: { id: { in: categoryIds }, isActive: true },
      });
      if (matches !== categoryIds.length)
        throw new ApiError(400, "VALIDATION_ERROR");
      await tx.restaurantCategory.deleteMany({ where: { restaurantId } });
      if (categoryIds.length > 0) {
        await tx.restaurantCategory.createMany({
          data: categoryIds.map((categoryId) => ({ restaurantId, categoryId })),
        });
      }
    }
    if (
      [neighborhoodId, address, latitude, longitude].some(
        (value) => value !== undefined,
      )
    ) {
      if (neighborhoodId !== undefined)
        await validateNeighborhoods(tx, [neighborhoodId]);
      await tx.branch.update({
        where: { id: branch.id },
        data: { neighborhoodId, address, latitude, longitude },
      });
    }
  });
  return readRestaurant(db, {
    id: restaurantId,
    branch: branchScope(restaurantId, branchId),
  });
}

async function assertReviewReady(
  tx: Prisma.TransactionClient,
  restaurant: Prisma.RestaurantGetPayload<{ select: typeof restaurantFields }>,
  branch: Awaited<ReturnType<typeof findBranch>>,
) {
  const missing = [];
  if (!restaurant.name) missing.push("name");
  if (!restaurant.contactPhone) missing.push("contactPhone");
  if (!branch.neighborhoodId) missing.push("neighborhoodId");
  if (!branch.address) missing.push("address");
  if (!restaurant.logoKey) missing.push("logo");
  if (!restaurant.coverImageKey) missing.push("coverImage");
  if (
    !(await tx.restaurantCategory.count({
      where: { restaurantId: restaurant.id, category: { isActive: true } },
    }))
  ) {
    missing.push("category");
  }
  if (!(await tx.openingPeriod.count({ where: { branchId: branch.id } })))
    missing.push("openingPeriod");
  if (
    !(await tx.deliveryZone.count({
      where: { branchId: branch.id, neighborhood: activeNeighborhood },
    }))
  )
    missing.push("deliveryZone");
  if (
    !(await tx.restaurantDocument.count({
      where: { restaurantId: restaurant.id },
    }))
  )
    missing.push("document");
  if (missing.length > 0) throw new ApiError(409, "CONFLICT", { missing });
}

const reviewActions = {
  approve: ["PENDING_REVIEW", "APPROVED"],
  reject: ["PENDING_REVIEW", "REJECTED"],
  suspend: ["APPROVED", "SUSPENDED"],
  resume: ["SUSPENDED", "APPROVED"],
} as const satisfies Record<
  string,
  readonly [RestaurantStatus, RestaurantStatus]
>;

function registerAdminRestaurantRoutes(api: FastifyInstance, db: PrismaClient) {
  api.get("/admin/restaurants", reviewOperators, async (request) => {
    const { status } = adminRestaurantListQuerySchema.parse(request.query);
    return db.restaurant.findMany({
      where: { status },
      select: restaurantFields,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
  });

  api.get(
    "/admin/restaurants/:restaurantId",
    reviewOperators,
    async (request) => {
      const { restaurantId } = restaurantIdParamsSchema.parse(request.params);
      return readRestaurant(db, { id: restaurantId });
    },
  );

  for (const [action, [from, to]] of Object.entries(reviewActions)) {
    api.post(
      `/admin/restaurants/:restaurantId/${action}`,
      reviewOperators,
      async (request) => {
        const { restaurantId } = restaurantIdParamsSchema.parse(request.params);
        const { reason } = restaurantReviewSchema.parse(request.body);

        return db.$transaction(async (tx) => {
          await lockRestaurant(tx, restaurantId);
          const before = await tx.restaurant.findUniqueOrThrow({
            where: { id: restaurantId },
            select: { status: true, reviewReason: true },
          });
          const result = await tx.restaurant.updateMany({
            where: { id: restaurantId, status: from },
            data: { status: to, reviewReason: reason },
          });
          if (result.count !== 1) throw new ApiError(409, "CONFLICT");

          const after = { status: to, reviewReason: reason };
          await writeAdminAudit(tx, request, {
            action: `RESTAURANT_${action.toUpperCase()}`,
            entityType: "Restaurant",
            entityId: restaurantId,
            before,
            after,
          });
          return after;
        });
      },
    );
  }

  api.patch(
    "/admin/restaurants/:restaurantId/commission",
    financeOperators,
    async (request) => {
      const { restaurantId } = restaurantIdParamsSchema.parse(request.params);
      const { commissionRateBps } = restaurantCommissionSchema.parse(
        request.body,
      );

      return db.$transaction(async (tx) => {
        await lockRestaurant(tx, restaurantId);
        const before = await tx.restaurant.findUniqueOrThrow({
          where: { id: restaurantId },
          select: { commissionRateBps: true },
        });
        const after = await tx.restaurant.update({
          where: { id: restaurantId },
          data: { commissionRateBps },
          select: { commissionRateBps: true },
        });
        await writeAdminAudit(tx, request, {
          action: "RESTAURANT_COMMISSION_UPDATE",
          entityType: "Restaurant",
          entityId: restaurantId,
          before,
          after,
        });
        return after;
      });
    },
  );
}

export function registerRestaurantRoutes(
  api: FastifyInstance,
  { db }: { db: PrismaClient },
): void {
  api.get("/restaurant/profile", ownerOnly, async (request) => {
    return readRestaurant(db, { id: requireRestaurant(request).restaurantId });
  });

  api.patch("/restaurant/profile", ownerOnly, (request) =>
    patchProfile(db, request),
  );

  api.get(
    "/restaurant/branches/:branchId/profile",
    ownerOnly,
    async (request) => {
      const { restaurantId } = requireRestaurant(request);
      const { branchId } = restaurantBranchParamsSchema.parse(request.params);
      return readRestaurant(db, {
        id: restaurantId,
        branch: branchScope(restaurantId, branchId),
      });
    },
  );

  api.patch("/restaurant/branches/:branchId/profile", ownerOnly, (request) => {
    const { branchId } = restaurantBranchParamsSchema.parse(request.params);
    return patchProfile(db, request, branchId);
  });

  api.post("/restaurant/profile/submit", ownerOnly, async (request) => {
    const { restaurantId } = requireRestaurant(request);
    return db.$transaction(async (tx) => {
      await lockRestaurant(tx, restaurantId);
      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: restaurantFields,
      });
      if (restaurant.status !== "DRAFT" && restaurant.status !== "REJECTED")
        throw new ApiError(409, "CONFLICT");
      const branch = await lockBranch(tx, restaurantId);
      await assertReviewReady(tx, restaurant, branch);

      const status = "PENDING_REVIEW";
      const updated = await tx.restaurant.updateMany({
        where: { id: restaurantId, status: restaurant.status },
        data: { status, reviewReason: null },
      });
      if (updated.count !== 1) throw new ApiError(409, "CONFLICT");
      return { status };
    });
  });

  api.get(
    "/restaurant/branch/opening-periods",
    branchManagers,
    async (request) => {
      const { id: branchId } = await findBranch(
        db,
        requireRestaurant(request).restaurantId,
      );
      return {
        periods: await db.openingPeriod.findMany({
          where: { branchId },
          select: openingPeriodFields,
          orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }],
        }),
      };
    },
  );

  api.put(
    "/restaurant/branch/opening-periods",
    branchManagers,
    async (request) => {
      const { restaurantId } = requireRestaurant(request);
      const { periods } = openingPeriodsSchema.parse(request.body);
      return db.$transaction(async (tx) => {
        const { id: branchId } = await lockBranch(tx, restaurantId);
        await tx.openingPeriod.deleteMany({ where: { branchId } });
        if (periods.length > 0)
          await tx.openingPeriod.createMany({
            data: periods.map((period) => ({ branchId, ...period })),
          });
        return { periods };
      });
    },
  );

  api.get("/restaurant/branch/settings", branchManagers, async (request) => {
    const { minOrderMinor, pickupEnabled } = await findBranch(
      db,
      requireRestaurant(request).restaurantId,
    );
    return { minOrderMinor, pickupEnabled };
  });

  api.patch("/restaurant/branch/settings", branchManagers, async (request) => {
    const { restaurantId } = requireRestaurant(request);
    const { minOrderMinor, pickupEnabled } =
      restaurantBranchSettingsSchema.parse(request.body);
    return db.$transaction(async (tx) => {
      const branch = await lockBranch(tx, restaurantId);
      const updated = await tx.branch.update({
        where: { id: branch.id },
        data: {
          minOrderMinor:
            minOrderMinor === undefined ? undefined : BigInt(minOrderMinor),
          pickupEnabled,
        },
        select: { minOrderMinor: true, pickupEnabled: true },
      });
      return { ...updated, minOrderMinor: minorNumber(updated.minOrderMinor) };
    });
  });

  api.get(
    "/restaurant/branch/delivery-zones",
    branchManagers,
    async (request) => {
      const { id: branchId } = await findBranch(
        db,
        requireRestaurant(request).restaurantId,
      );
      const zones = await db.deliveryZone.findMany({
        where: { branchId },
        select: deliveryZoneFields,
        orderBy: { neighborhoodId: "asc" },
      });
      return { zones: zones.map(serializeZone) };
    },
  );

  api.put(
    "/restaurant/branch/delivery-zones",
    branchManagers,
    async (request) => {
      const { restaurantId } = requireRestaurant(request);
      const { zones } = deliveryZonesSchema.parse(request.body);
      return db.$transaction(async (tx) => {
        const { id: branchId } = await lockBranch(tx, restaurantId);
        const neighborhoodIds = zones.map(
          ({ neighborhoodId }) => neighborhoodId,
        );
        await validateNeighborhoods(tx, neighborhoodIds);
        await tx.deliveryZone.deleteMany({
          where: { branchId, neighborhoodId: { notIn: neighborhoodIds } },
        });
        const updated = [];
        for (const zone of zones) {
          const { neighborhoodId, etaMinutes, feeMinor } = zone;
          const data = { feeMinor: BigInt(feeMinor), etaMinutes };
          const entry = await tx.deliveryZone.upsert({
            where: { branchId_neighborhoodId: { branchId, neighborhoodId } },
            create: { ...data, branchId, neighborhoodId },
            update: data,
            select: deliveryZoneFields,
          });
          updated.push(serializeZone(entry));
        }
        return { zones: updated };
      });
    },
  );

  api.get(
    "/restaurant/delivery-zones/:zoneId",
    branchManagers,
    async (request) => {
      const { restaurantId } = requireRestaurant(request);
      const { zoneId } = deliveryZoneParamsSchema.parse(request.params);
      const zone = await db.deliveryZone.findFirst({
        where: { id: zoneId, branch: { restaurantId } },
        select: deliveryZoneFields,
      });
      if (!zone) throw new ApiError(404, "NOT_FOUND");
      return serializeZone(zone);
    },
  );

  api.patch(
    "/restaurant/delivery-zones/:zoneId",
    branchManagers,
    async (request) => {
      const { restaurantId } = requireRestaurant(request);
      const { zoneId } = deliveryZoneParamsSchema.parse(request.params);
      const { feeMinor, etaMinutes } = deliveryZonePatchSchema.parse(
        request.body,
      );
      return db.$transaction(async (tx) => {
        const { id: branchId } = await lockBranch(tx, restaurantId);
        const [zone] = await tx.deliveryZone.updateManyAndReturn({
          where: { id: zoneId, branchId },
          data: {
            feeMinor: feeMinor === undefined ? undefined : BigInt(feeMinor),
            etaMinutes,
          },
          select: deliveryZoneFields,
        });
        if (!zone) throw new ApiError(404, "NOT_FOUND");
        return serializeZone(zone);
      });
    },
  );

  api.delete(
    "/restaurant/delivery-zones/:zoneId",
    branchManagers,
    async (request, reply) => {
      const { restaurantId } = requireRestaurant(request);
      const { zoneId } = deliveryZoneParamsSchema.parse(request.params);
      await db.$transaction(async (tx) => {
        const { id: branchId } = await lockBranch(tx, restaurantId);
        const result = await tx.deliveryZone.deleteMany({
          where: { id: zoneId, branchId },
        });
        if (result.count !== 1) throw new ApiError(404, "NOT_FOUND");
      });
      return reply.code(204).send();
    },
  );

  registerAdminRestaurantRoutes(api, db);
}
