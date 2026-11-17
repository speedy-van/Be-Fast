import { randomUUID } from "node:crypto";
import {
  branchAcceptingOrdersSchema,
  menuAvailabilitySchema,
  menuItemIdSchema,
  menuOptionIdSchema,
} from "@be-fast/contracts";
import { messages } from "@be-fast/i18n";
import type { FastifyInstance } from "fastify";
import { requireRestaurant, requireRestaurantRole } from "../auth/access.js";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { lockMenu, menuEditors, menuItemScope, menuReaders } from "./shared.js";

async function copyOptions(
  tx: Prisma.TransactionClient,
  sourceId: string,
  targetId: string,
) {
  const groups = await tx.optionGroup.findMany({
    where: { menuItemId: sourceId, deletedAt: null },
    select: {
      id: true,
      name: true,
      minSelect: true,
      maxSelect: true,
      sortOrder: true,
    },
  });
  const groupIds = new Map(groups.map(({ id }) => [id, randomUUID()]));
  await tx.optionGroup.createMany({
    data: groups.map(({ id, ...group }) => ({
      ...group,
      id: groupIds.get(id),
      menuItemId: targetId,
    })),
  });
  const options = await tx.option.findMany({
    where: {
      optionGroupId: { in: groups.map(({ id }) => id) },
      deletedAt: null,
    },
    select: {
      optionGroupId: true,
      name: true,
      priceMinor: true,
      sortOrder: true,
      isAvailable: true,
    },
  });
  await tx.option.createMany({
    data: options.map(({ optionGroupId, ...option }) => {
      const targetGroupId = groupIds.get(optionGroupId);
      if (!targetGroupId) throw new ApiError(500, "INTERNAL_ERROR");
      return { ...option, optionGroupId: targetGroupId };
    }),
  });
}

export function registerMenuActionRoutes(
  api: FastifyInstance,
  { db }: { db: PrismaClient },
) {
  api.patch(
    "/restaurant/menu/items/:itemId/availability",
    menuReaders,
    async (request) => {
      const { restaurantId } = requireRestaurant(request);
      const { itemId } = menuItemIdSchema.parse(request.params);
      const { isAvailable } = menuAvailabilitySchema.parse(request.body);
      return db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        const result = await tx.menuItem.updateMany({
          where: { id: itemId, ...menuItemScope(restaurantId) },
          data: { isAvailable },
        });
        if (!result.count) throw new ApiError(404, "NOT_FOUND");
        return { id: itemId, isAvailable };
      });
    },
  );

  api.patch(
    "/restaurant/menu/options/:optionId/availability",
    menuReaders,
    async (request) => {
      const { restaurantId } = requireRestaurant(request);
      const { optionId } = menuOptionIdSchema.parse(request.params);
      const { isAvailable } = menuAvailabilitySchema.parse(request.body);
      return db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        const result = await tx.option.updateMany({
          where: {
            id: optionId,
            deletedAt: null,
            optionGroup: {
              deletedAt: null,
              menuItem: menuItemScope(restaurantId),
            },
          },
          data: { isAvailable },
        });
        if (!result.count) throw new ApiError(404, "NOT_FOUND");
        return { id: optionId, isAvailable };
      });
    },
  );

  api.post(
    "/restaurant/menu/items/:itemId/duplicate",
    menuEditors,
    async (request, reply) => {
      const { restaurantId } = requireRestaurant(request);
      const { itemId } = menuItemIdSchema.parse(request.params);
      const created = await db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        const source = await tx.menuItem.findFirst({
          where: { id: itemId, ...menuItemScope(restaurantId) },
          select: {
            sectionId: true,
            name: true,
            description: true,
            imageKey: true,
            sortOrder: true,
            availableFrom: true,
            availableTo: true,
          },
        });
        if (!source) throw new ApiError(404, "NOT_FOUND");
        const sizes = await tx.itemSize.findMany({
          where: { menuItemId: itemId, deletedAt: null },
          select: { name: true, priceMinor: true, sortOrder: true },
        });
        if (!sizes.length) throw new ApiError(409, "CONFLICT");

        const duplicate = await tx.menuItem.create({
          data: {
            ...source,
            name: source.name + messages.menu.copySuffix,
            isAvailable: false,
          },
          select: { id: true, name: true, isAvailable: true },
        });
        await tx.itemSize.createMany({
          data: sizes.map((size) => ({ ...size, menuItemId: duplicate.id })),
        });
        await copyOptions(tx, itemId, duplicate.id);
        return duplicate;
      });
      return reply.code(201).send(created);
    },
  );

  const pauseEditors = {
    preHandler: requireRestaurantRole("OWNER", "MANAGER", "CASHIER"),
  };
  api.patch(
    "/restaurant/branch/accepting-orders",
    pauseEditors,
    async (request) => {
      const { restaurantId } = requireRestaurant(request);
      const { acceptingOrders } = branchAcceptingOrdersSchema.parse(
        request.body,
      );
      return db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        if (acceptingOrders) {
          const restaurant = await tx.restaurant.findUnique({
            where: { id: restaurantId },
            select: { status: true },
          });
          const item = await tx.menuItem.findFirst({
            where: {
              ...menuItemScope(restaurantId),
              sizes: { some: { deletedAt: null } },
            },
            select: { id: true },
          });
          if (restaurant?.status !== "APPROVED" || !item)
            throw new ApiError(409, "CONFLICT");
        }
        const branch = await tx.branch.findUnique({
          where: { restaurantId },
          select: { id: true },
        });
        if (!branch) throw new ApiError(404, "NOT_FOUND");
        return tx.branch.update({
          where: { id: branch.id, restaurantId },
          data: { acceptingOrders },
          select: { id: true, acceptingOrders: true },
        });
      });
    },
  );
}
