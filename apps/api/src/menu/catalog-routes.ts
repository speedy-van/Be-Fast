import {
  createMenuItemSchema,
  createMenuSectionSchema,
  createMenuSizeSchema,
  menuItemPathSchema,
  menuSectionPathSchema,
  menuSizePathSchema,
  patchMenuItemSchema,
  patchMenuSectionSchema,
  patchMenuSizeSchema,
} from "@be-fast/contracts";
import { messages } from "@be-fast/i18n";
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

const menuOrder = [{ sortOrder: "asc" as const }, { id: "asc" as const }];
const sectionFields = { id: true, name: true, sortOrder: true } as const;
const itemFields = {
  id: true,
  sectionId: true,
  name: true,
  description: true,
  imageKey: true,
  isAvailable: true,
  sortOrder: true,
  availableFrom: true,
  availableTo: true,
} as const;
const sizeFields = {
  id: true,
  menuItemId: true,
  name: true,
  priceMinor: true,
  sortOrder: true,
} as const;
const itemGraph = {
  ...itemFields,
  sizes: { where: { deletedAt: null }, orderBy: menuOrder, select: sizeFields },
  optionGroups: {
    where: { deletedAt: null },
    orderBy: menuOrder,
    select: {
      id: true,
      menuItemId: true,
      name: true,
      minSelect: true,
      maxSelect: true,
      sortOrder: true,
      options: {
        where: { deletedAt: null },
        orderBy: menuOrder,
        select: {
          id: true,
          optionGroupId: true,
          name: true,
          priceMinor: true,
          isAvailable: true,
          sortOrder: true,
        },
      },
    },
  },
} satisfies Prisma.MenuItemSelect;

function serializePrice<T extends { priceMinor: bigint }>(entry: T) {
  return { ...entry, priceMinor: minorNumber(entry.priceMinor) };
}

function serializeItem({
  sizes,
  optionGroups,
  ...item
}: Prisma.MenuItemGetPayload<{ select: typeof itemGraph }>) {
  return {
    ...item,
    sizes: sizes.map(serializePrice),
    optionGroups: optionGroups.map(({ options, ...group }) => ({
      ...group,
      options: options.map(serializePrice),
    })),
  };
}

function sectionScope(restaurantId: string) {
  return { restaurantId, deletedAt: null };
}

function sizeScope(restaurantId: string) {
  return {
    deletedAt: null,
    menuItem: menuItemScope(restaurantId),
  } satisfies Prisma.ItemSizeWhereInput;
}

async function findSection(
  db: Prisma.TransactionClient,
  restaurantId: string,
  sectionId: string,
) {
  const section = await db.menuSection.findFirst({
    where: { ...sectionScope(restaurantId), id: sectionId },
    select: sectionFields,
  });
  if (!section) throw new ApiError(404, "NOT_FOUND");
  return section;
}

async function findItem(
  db: Prisma.TransactionClient,
  restaurantId: string,
  itemId: string,
) {
  const item = await db.menuItem.findFirst({
    where: { ...menuItemScope(restaurantId), id: itemId },
    select: { id: true },
  });
  if (!item) throw new ApiError(404, "NOT_FOUND");
  return item;
}

async function findSize(
  db: Prisma.TransactionClient,
  restaurantId: string,
  sizeId: string,
) {
  const size = await db.itemSize.findFirst({
    where: { ...sizeScope(restaurantId), id: sizeId },
    select: sizeFields,
  });
  if (!size) throw new ApiError(404, "NOT_FOUND");
  return size;
}

async function softDeleteItems(
  tx: Prisma.TransactionClient,
  scope: Prisma.MenuItemWhereInput,
  deletedAt: Date,
) {
  const items = await tx.menuItem.findMany({
    where: scope,
    select: { id: true },
  });
  const menuItemId = { in: items.map(({ id }) => id) };
  if (items.length === 0) return;

  await tx.option.updateMany({
    where: { deletedAt: null, optionGroup: { menuItemId } },
    data: { deletedAt },
  });
  await tx.optionGroup.updateMany({
    where: { deletedAt: null, menuItemId },
    data: { deletedAt },
  });
  await tx.itemSize.updateMany({
    where: { deletedAt: null, menuItemId },
    data: { deletedAt },
  });
  await tx.menuItem.updateMany({
    where: { id: menuItemId },
    data: { deletedAt },
  });
}

function registerSections(api: FastifyInstance, db: PrismaClient) {
  api.get("/restaurant/menu/sections", menuReaders, async (request) => {
    const { restaurantId } = requireRestaurant(request);
    return {
      sections: await db.menuSection.findMany({
        where: sectionScope(restaurantId),
        orderBy: menuOrder,
        select: sectionFields,
      }),
    };
  });

  api.get(
    "/restaurant/menu/sections/:sectionId",
    menuReaders,
    async (request) => {
      const { restaurantId } = requireRestaurant(request);
      const { sectionId } = menuSectionPathSchema.parse(request.params);
      return findSection(db, restaurantId, sectionId);
    },
  );

  api.post("/restaurant/menu/sections", menuEditors, async (request, reply) => {
    const { restaurantId } = requireRestaurant(request);
    const data = createMenuSectionSchema.parse(request.body);
    const section = await db.$transaction(async (tx) => {
      await lockMenu(tx, restaurantId);
      return tx.menuSection.create({
        data: { ...data, restaurantId },
        select: sectionFields,
      });
    });
    return reply.code(201).send(section);
  });

  api.patch(
    "/restaurant/menu/sections/:sectionId",
    menuEditors,
    async (request) => {
      const { restaurantId } = requireRestaurant(request);
      const { sectionId } = menuSectionPathSchema.parse(request.params);
      const data = patchMenuSectionSchema.parse(request.body);
      return db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        const { id } = await findSection(tx, restaurantId, sectionId);
        return tx.menuSection.update({
          where: { id },
          data,
          select: sectionFields,
        });
      });
    },
  );

  api.delete(
    "/restaurant/menu/sections/:sectionId",
    menuEditors,
    async (request, reply) => {
      const { restaurantId } = requireRestaurant(request);
      const { sectionId } = menuSectionPathSchema.parse(request.params);
      await db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        const { id } = await findSection(tx, restaurantId, sectionId);
        const deletedAt = new Date();
        await softDeleteItems(
          tx,
          { ...menuItemScope(restaurantId), sectionId: id },
          deletedAt,
        );
        await tx.menuSection.update({
          where: { id },
          data: { deletedAt },
          select: { id: true },
        });
      });
      return reply.code(204).send();
    },
  );
}

function registerItems(api: FastifyInstance, db: PrismaClient) {
  api.get("/restaurant/menu/items", menuReaders, async (request) => {
    const { restaurantId } = requireRestaurant(request);
    const items = await db.menuItem.findMany({
      where: menuItemScope(restaurantId),
      orderBy: menuOrder,
      select: itemGraph,
    });
    return { items: items.map(serializeItem) };
  });

  api.get("/restaurant/menu/items/:itemId", menuReaders, async (request) => {
    const { restaurantId } = requireRestaurant(request);
    const { itemId } = menuItemPathSchema.parse(request.params);
    const item = await db.menuItem.findFirst({
      where: { ...menuItemScope(restaurantId), id: itemId },
      select: itemGraph,
    });
    if (!item) throw new ApiError(404, "NOT_FOUND");
    return serializeItem(item);
  });

  api.post("/restaurant/menu/items", menuEditors, async (request, reply) => {
    const { restaurantId } = requireRestaurant(request);
    const { sizes, ...data } = createMenuItemSchema.parse(request.body);
    const item = await db.$transaction(async (tx) => {
      await lockMenu(tx, restaurantId);
      await findSection(tx, restaurantId, data.sectionId);
      const created = await tx.menuItem.create({ data, select: itemFields });
      const createdSizes = await tx.itemSize.createManyAndReturn({
        data: sizes.map(({ name, priceMinor, sortOrder }) => ({
          menuItemId: created.id,
          name:
            sizes.length === 1
              ? messages.menu.regularSize
              : (name ?? messages.menu.regularSize),
          priceMinor: BigInt(priceMinor),
          sortOrder,
        })),
        select: sizeFields,
      });
      return serializeItem({
        ...created,
        sizes: createdSizes,
        optionGroups: [],
      });
    });
    return reply.code(201).send(item);
  });

  api.patch("/restaurant/menu/items/:itemId", menuEditors, async (request) => {
    const { restaurantId } = requireRestaurant(request);
    const { itemId } = menuItemPathSchema.parse(request.params);
    const data = patchMenuItemSchema.parse(request.body);
    return db.$transaction(async (tx) => {
      await lockMenu(tx, restaurantId);
      const { id } = await findItem(tx, restaurantId, itemId);
      if (data.sectionId !== undefined)
        await findSection(tx, restaurantId, data.sectionId);
      return tx.menuItem.update({ where: { id }, data, select: itemFields });
    });
  });

  api.delete(
    "/restaurant/menu/items/:itemId",
    menuEditors,
    async (request, reply) => {
      const { restaurantId } = requireRestaurant(request);
      const { itemId } = menuItemPathSchema.parse(request.params);
      await db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        await findItem(tx, restaurantId, itemId);
        await softDeleteItems(
          tx,
          { ...menuItemScope(restaurantId), id: itemId },
          new Date(),
        );
      });
      return reply.code(204).send();
    },
  );
}

function registerSizes(api: FastifyInstance, db: PrismaClient) {
  api.get(
    "/restaurant/menu/items/:itemId/sizes",
    menuReaders,
    async (request) => {
      const { restaurantId } = requireRestaurant(request);
      const { itemId } = menuItemPathSchema.parse(request.params);
      await findItem(db, restaurantId, itemId);
      const sizes = await db.itemSize.findMany({
        where: { ...sizeScope(restaurantId), menuItemId: itemId },
        orderBy: menuOrder,
        select: sizeFields,
      });
      return { sizes: sizes.map(serializePrice) };
    },
  );

  api.get("/restaurant/menu/sizes/:sizeId", menuReaders, async (request) => {
    const { restaurantId } = requireRestaurant(request);
    const { sizeId } = menuSizePathSchema.parse(request.params);
    return serializePrice(await findSize(db, restaurantId, sizeId));
  });

  api.post(
    "/restaurant/menu/items/:itemId/sizes",
    menuEditors,
    async (request, reply) => {
      const { restaurantId } = requireRestaurant(request);
      const { itemId } = menuItemPathSchema.parse(request.params);
      const { priceMinor, ...data } = createMenuSizeSchema.parse(request.body);
      const size = await db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        const { id } = await findItem(tx, restaurantId, itemId);
        return tx.itemSize.create({
          data: { ...data, menuItemId: id, priceMinor: BigInt(priceMinor) },
          select: sizeFields,
        });
      });
      return reply.code(201).send(serializePrice(size));
    },
  );

  api.patch("/restaurant/menu/sizes/:sizeId", menuEditors, async (request) => {
    const { restaurantId, sub } = requireRestaurant(request);
    const { sizeId } = menuSizePathSchema.parse(request.params);
    const { priceMinor, name, sortOrder } = patchMenuSizeSchema.parse(
      request.body,
    );
    const size = await db.$transaction(async (tx) => {
      await lockMenu(tx, restaurantId);
      const current = await findSize(tx, restaurantId, sizeId);
      const nextPriceMinor =
        priceMinor === undefined ? current.priceMinor : BigInt(priceMinor);
      let nextName = name;
      if (
        name !== undefined &&
        (await tx.itemSize.count({
          where: { menuItemId: current.menuItemId, deletedAt: null },
        })) === 1
      ) {
        nextName = messages.menu.regularSize;
      }
      const updated = await tx.itemSize.update({
        where: { id: current.id },
        data: { name: nextName, sortOrder, priceMinor: nextPriceMinor },
        select: sizeFields,
      });
      if (nextPriceMinor !== current.priceMinor) {
        await tx.priceChangeLog.create({
          data: {
            restaurantUserId: sub,
            itemSizeId: current.id,
            oldPriceMinor: current.priceMinor,
            newPriceMinor: nextPriceMinor,
          },
          select: { id: true },
        });
      }
      return updated;
    });
    return serializePrice(size);
  });

  api.delete(
    "/restaurant/menu/sizes/:sizeId",
    menuEditors,
    async (request, reply) => {
      const { restaurantId } = requireRestaurant(request);
      const { sizeId } = menuSizePathSchema.parse(request.params);
      await db.$transaction(async (tx) => {
        await lockMenu(tx, restaurantId);
        const { id, menuItemId } = await findSize(tx, restaurantId, sizeId);
        const remaining = await tx.itemSize.findMany({
          where: { menuItemId, deletedAt: null, id: { not: id } },
          select: { id: true },
          take: 2,
        });
        if (!remaining[0]) throw new ApiError(409, "CONFLICT");
        await tx.itemSize.update({
          where: { id },
          data: { deletedAt: new Date() },
          select: { id: true },
        });
        if (remaining.length === 1) {
          await tx.itemSize.update({
            where: { id: remaining[0].id },
            data: { name: messages.menu.regularSize },
            select: { id: true },
          });
        }
      });
      return reply.code(204).send();
    },
  );
}

export function registerMenuCatalogRoutes(
  api: FastifyInstance,
  { db }: { db: PrismaClient },
): void {
  api.get("/restaurant/menu", menuReaders, async (request) => {
    const { restaurantId } = requireRestaurant(request);
    const sections = await db.menuSection.findMany({
      where: sectionScope(restaurantId),
      orderBy: menuOrder,
      select: {
        ...sectionFields,
        items: {
          where: { deletedAt: null },
          orderBy: menuOrder,
          select: itemGraph,
        },
      },
    });
    return {
      sections: sections.map(({ items, ...section }) => ({
        ...section,
        items: items.map(serializeItem),
      })),
    };
  });
  registerSections(api, db);
  registerItems(api, db);
  registerSizes(api, db);
}
