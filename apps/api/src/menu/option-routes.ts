import {
  createMenuOptionGroupSchema,
  createMenuOptionSchema,
  menuOptionGroupParamsSchema,
  menuOptionGroupsParamsSchema,
  menuOptionParamsSchema,
  patchMenuOptionGroupSchema,
  patchMenuOptionSchema,
} from "@be-fast/contracts";
import { hasValidOptionBounds } from "@be-fast/domain";
import type { FastifyInstance } from "fastify";
import { requireRestaurant } from "../auth/access.js";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import {
  lockMenu,
  menuEditors,
  menuItemScope,
  menuReaders,
  minorNumber,
} from "./shared.js";

const optionFields = {
  id: true,
  optionGroupId: true,
  name: true,
  priceMinor: true,
  isAvailable: true,
  sortOrder: true,
} as const satisfies Prisma.OptionSelect;

const groupFields = {
  id: true,
  menuItemId: true,
  name: true,
  minSelect: true,
  maxSelect: true,
  sortOrder: true,
  options: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: optionFields,
  },
} satisfies Prisma.OptionGroupSelect;

type SelectedOption = Prisma.OptionGetPayload<{ select: typeof optionFields }>;
type SelectedGroup = Prisma.OptionGroupGetPayload<{
  select: typeof groupFields;
}>;

function serializeOption(option: SelectedOption) {
  return { ...option, priceMinor: minorNumber(option.priceMinor) };
}

function serializeGroup(group: SelectedGroup) {
  return { ...group, options: group.options.map(serializeOption) };
}

function groupScope(restaurantId: string) {
  return { deletedAt: null, menuItem: menuItemScope(restaurantId) };
}

function optionScope(restaurantId: string) {
  return { deletedAt: null, optionGroup: groupScope(restaurantId) };
}

async function requireItem(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  itemId: string,
) {
  const item = await tx.menuItem.findFirst({
    where: { ...menuItemScope(restaurantId), id: itemId },
    select: { id: true },
  });
  if (!item) throw new ApiError(404, "NOT_FOUND");
}

async function requireGroup(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  groupId: string,
) {
  const group = await tx.optionGroup.findFirst({
    where: { ...groupScope(restaurantId), id: groupId },
    select: groupFields,
  });
  if (!group) throw new ApiError(404, "NOT_FOUND");
  return group;
}

async function requireOption(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  optionId: string,
) {
  const option = await tx.option.findFirst({
    where: { ...optionScope(restaurantId), id: optionId },
    select: optionFields,
  });
  if (!option) throw new ApiError(404, "NOT_FOUND");
  return option;
}

function validateBounds(
  minSelect: number,
  maxSelect: number,
  optionCount: number,
) {
  if (!hasValidOptionBounds(minSelect, maxSelect, optionCount)) {
    throw new ApiError(400, "VALIDATION_ERROR");
  }
}

function registerOptionGroups(api: FastifyInstance, db: PrismaClient) {
  api.get(
    "/restaurant/menu/items/:itemId/option-groups",
    menuReaders,
    async (request) => {
      const { itemId } = menuOptionGroupsParamsSchema.parse(request.params);
      const { restaurantId } = requireRestaurant(request);
      await requireItem(db, restaurantId, itemId);
      const groups = await db.optionGroup.findMany({
        where: { ...groupScope(restaurantId), menuItemId: itemId },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: groupFields,
      });
      return { groups: groups.map(serializeGroup) };
    },
  );

  api.post(
    "/restaurant/menu/items/:itemId/option-groups",
    menuEditors,
    async (request, reply) => {
      const { itemId } = menuOptionGroupsParamsSchema.parse(request.params);
      const { restaurantId } = requireRestaurant(request);
      const { options, ...data } = createMenuOptionGroupSchema.parse(
        request.body,
      );

      const group = await db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        await requireItem(tx, restaurantId, itemId);
        validateBounds(data.minSelect, data.maxSelect, options.length);
        return tx.optionGroup.create({
          data: {
            ...data,
            menuItemId: itemId,
            options: {
              create: options.map((option) => ({
                ...option,
                priceMinor: BigInt(option.priceMinor),
              })),
            },
          },
          select: groupFields,
        });
      });
      return reply.code(201).send(serializeGroup(group));
    },
  );

  api.get(
    "/restaurant/menu/option-groups/:groupId",
    menuReaders,
    async (request) => {
      const { groupId } = menuOptionGroupParamsSchema.parse(request.params);
      const { restaurantId } = requireRestaurant(request);
      return serializeGroup(await requireGroup(db, restaurantId, groupId));
    },
  );

  api.patch(
    "/restaurant/menu/option-groups/:groupId",
    menuEditors,
    async (request) => {
      const { groupId } = menuOptionGroupParamsSchema.parse(request.params);
      const { restaurantId } = requireRestaurant(request);
      const data = patchMenuOptionGroupSchema.parse(request.body);

      const updated = await db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        const current = await requireGroup(tx, restaurantId, groupId);
        validateBounds(
          data.minSelect ?? current.minSelect,
          data.maxSelect ?? current.maxSelect,
          current.options.length,
        );
        return tx.optionGroup.update({
          where: { ...groupScope(restaurantId), id: groupId },
          data,
          select: groupFields,
        });
      });
      return serializeGroup(updated);
    },
  );

  api.delete(
    "/restaurant/menu/option-groups/:groupId",
    menuEditors,
    async (request, reply) => {
      const { groupId } = menuOptionGroupParamsSchema.parse(request.params);
      const { restaurantId } = requireRestaurant(request);
      await db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        await requireGroup(tx, restaurantId, groupId);
        const deletedAt = new Date();
        await tx.option.updateMany({
          where: { ...optionScope(restaurantId), optionGroupId: groupId },
          data: { deletedAt },
        });
        await tx.optionGroup.update({
          where: { ...groupScope(restaurantId), id: groupId },
          data: { deletedAt },
        });
      });
      return reply.code(204).send();
    },
  );
}

function registerOptions(api: FastifyInstance, db: PrismaClient) {
  api.get(
    "/restaurant/menu/option-groups/:groupId/options",
    menuReaders,
    async (request) => {
      const { groupId } = menuOptionGroupParamsSchema.parse(request.params);
      const { restaurantId } = requireRestaurant(request);
      const group = await requireGroup(db, restaurantId, groupId);
      return { options: group.options.map(serializeOption) };
    },
  );

  api.post(
    "/restaurant/menu/option-groups/:groupId/options",
    menuEditors,
    async (request, reply) => {
      const { groupId } = menuOptionGroupParamsSchema.parse(request.params);
      const { restaurantId } = requireRestaurant(request);
      const { priceMinor, ...data } = createMenuOptionSchema.parse(
        request.body,
      );

      const option = await db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        const group = await requireGroup(tx, restaurantId, groupId);
        validateBounds(
          group.minSelect,
          group.maxSelect,
          group.options.length + 1,
        );
        return tx.option.create({
          data: {
            ...data,
            optionGroupId: groupId,
            priceMinor: BigInt(priceMinor),
          },
          select: optionFields,
        });
      });
      return reply.code(201).send(serializeOption(option));
    },
  );

  api.get(
    "/restaurant/menu/options/:optionId",
    menuReaders,
    async (request) => {
      const { optionId } = menuOptionParamsSchema.parse(request.params);
      const { restaurantId } = requireRestaurant(request);
      return serializeOption(await requireOption(db, restaurantId, optionId));
    },
  );

  api.patch(
    "/restaurant/menu/options/:optionId",
    menuEditors,
    async (request) => {
      const { optionId } = menuOptionParamsSchema.parse(request.params);
      const { restaurantId, sub: restaurantUserId } =
        requireRestaurant(request);
      const { priceMinor, ...data } = patchMenuOptionSchema.parse(request.body);

      const updated = await db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        const before = await requireOption(tx, restaurantId, optionId);
        const nextPrice =
          priceMinor === undefined ? undefined : BigInt(priceMinor);
        const after = await tx.option.update({
          where: { ...optionScope(restaurantId), id: optionId },
          data: { ...data, priceMinor: nextPrice },
          select: optionFields,
        });
        if (after.priceMinor !== before.priceMinor) {
          await tx.priceChangeLog.create({
            data: {
              restaurantUserId,
              optionId,
              oldPriceMinor: before.priceMinor,
              newPriceMinor: after.priceMinor,
            },
          });
        }
        return after;
      });
      return serializeOption(updated);
    },
  );

  api.delete(
    "/restaurant/menu/options/:optionId",
    menuEditors,
    async (request, reply) => {
      const { optionId } = menuOptionParamsSchema.parse(request.params);
      const { restaurantId } = requireRestaurant(request);

      await db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        const option = await requireOption(tx, restaurantId, optionId);
        const group = await requireGroup(
          tx,
          restaurantId,
          option.optionGroupId,
        );
        validateBounds(
          group.minSelect,
          group.maxSelect,
          group.options.length - 1,
        );
        await tx.option.update({
          where: { ...optionScope(restaurantId), id: optionId },
          data: { deletedAt: new Date() },
        });
      });
      return reply.code(204).send();
    },
  );
}

export function registerMenuOptionRoutes(
  api: FastifyInstance,
  { db }: { db: PrismaClient },
) {
  registerOptionGroups(api, db);
  registerOptions(api, db);
}
