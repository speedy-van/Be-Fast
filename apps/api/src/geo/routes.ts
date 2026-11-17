import {
  cityCreateSchema,
  cityListQuerySchema,
  cityUpdateSchema,
  foodCategoryCreateSchema,
  foodCategoryUpdateSchema,
  geoListQuerySchema,
  governorateCreateSchema,
  governorateUpdateSchema,
  neighborhoodCreateSchema,
  neighborhoodListQuerySchema,
  neighborhoodUpdateSchema,
} from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { lockGeoRow, registerAdminGeoResource } from "./admin-crud.js";

type Transaction = Prisma.TransactionClient;

const publicPlace = { id: true, name: true } as const;
const place = { ...publicPlace, isActive: true } as const;
const city = { ...place, governorateId: true } as const;
const neighborhood = { ...place, cityId: true } as const;
const publicCategory = { ...publicPlace, icon: true, sortOrder: true } as const;
const category = { ...publicCategory, isActive: true } as const;
const placeOrder = [
  { name: "asc" },
  { id: "asc" },
] satisfies Prisma.GovernorateOrderByWithRelationInput[];
const categoryOrder = [
  { sortOrder: "asc" },
  { name: "asc" },
  { id: "asc" },
] satisfies Prisma.FoodCategoryOrderByWithRelationInput[];

function ensureActive(row: { isActive: boolean }): void {
  if (!row.isActive)
    throw new ApiError(409, "CONFLICT", { reason: "INACTIVE_PARENT" });
}

async function ensureActiveGovernorate(
  db: Transaction,
  id: string,
): Promise<void> {
  ensureActive(await lockGeoRow(db, "Governorate", id));
}

async function ensureActiveCity(db: Transaction, id: string): Promise<void> {
  ensureActive(await lockGeoRow(db, "City", id));
  const { governorateId } = await db.city.findUniqueOrThrow({
    where: { id },
    select: { governorateId: true },
  });
  await ensureActiveGovernorate(db, governorateId);
}

export function registerGeoRoutes(
  api: FastifyInstance,
  { db }: { db: PrismaClient },
): void {
  api.get("/public/geo", (request) => {
    geoListQuerySchema.parse(request.query);
    return db.governorate.findMany({
      where: { isActive: true },
      orderBy: placeOrder,
      select: {
        ...publicPlace,
        cities: {
          where: { isActive: true },
          orderBy: placeOrder,
          select: {
            ...publicPlace,
            neighborhoods: {
              where: { isActive: true },
              orderBy: placeOrder,
              select: publicPlace,
            },
          },
        },
      },
    });
  });

  api.get("/public/categories", (request) => {
    geoListQuerySchema.parse(request.query);
    return db.foodCategory.findMany({
      where: { isActive: true },
      orderBy: categoryOrder,
      select: publicCategory,
    });
  });

  registerAdminGeoResource(api, db, {
    collection: "governorates",
    entityType: "Governorate",
    createSchema: governorateCreateSchema,
    updateSchema: governorateUpdateSchema,
    list(db, query) {
      geoListQuerySchema.parse(query);
      return db.governorate.findMany({ orderBy: placeOrder, select: place });
    },
    read: (db, id) =>
      db.governorate.findUnique({ where: { id }, select: place }),
    create: (db, data) => db.governorate.create({ data, select: place }),
    update: (db, { id }, data) =>
      db.governorate.update({ where: { id }, data, select: place }),
    deactivate: (db, id) =>
      db.governorate.update({
        where: { id },
        data: { isActive: false },
        select: place,
      }),
    delete: (db, id) =>
      db.governorate.delete({ where: { id }, select: { id: true } }),
    async hasReferences(db, id) {
      return (
        (await db.city.count({ where: { governorateId: id }, take: 1 })) === 1
      );
    },
  });

  registerAdminGeoResource(api, db, {
    collection: "cities",
    entityType: "City",
    createSchema: cityCreateSchema,
    updateSchema: cityUpdateSchema,
    list(db, query) {
      const { governorateId } = cityListQuerySchema.parse(query);
      return db.city.findMany({
        where: { governorateId },
        orderBy: placeOrder,
        select: city,
      });
    },
    read: (db, id) => db.city.findUnique({ where: { id }, select: city }),
    async create(db, data) {
      await ensureActiveGovernorate(db, data.governorateId);
      return db.city.create({ data, select: city });
    },
    async update(db, { id, governorateId }, data) {
      if (data.governorateId !== undefined || data.isActive === true) {
        await ensureActiveGovernorate(db, data.governorateId ?? governorateId);
      }
      return db.city.update({ where: { id }, data, select: city });
    },
    deactivate: (db, id) =>
      db.city.update({
        where: { id },
        data: { isActive: false },
        select: city,
      }),
    delete: (db, id) => db.city.delete({ where: { id }, select: { id: true } }),
    async hasReferences(db, id) {
      return (
        (await db.neighborhood.count({ where: { cityId: id }, take: 1 })) === 1
      );
    },
  });

  registerAdminGeoResource(api, db, {
    collection: "neighborhoods",
    entityType: "Neighborhood",
    createSchema: neighborhoodCreateSchema,
    updateSchema: neighborhoodUpdateSchema,
    list(db, query) {
      const { cityId } = neighborhoodListQuerySchema.parse(query);
      return db.neighborhood.findMany({
        where: { cityId },
        orderBy: placeOrder,
        select: neighborhood,
      });
    },
    read: (db, id) =>
      db.neighborhood.findUnique({ where: { id }, select: neighborhood }),
    async create(db, data) {
      await ensureActiveCity(db, data.cityId);
      return db.neighborhood.create({ data, select: neighborhood });
    },
    async update(db, { id, cityId }, data) {
      if (data.cityId !== undefined || data.isActive === true) {
        await ensureActiveCity(db, data.cityId ?? cityId);
      }
      return db.neighborhood.update({
        where: { id },
        data,
        select: neighborhood,
      });
    },
    deactivate: (db, id) =>
      db.neighborhood.update({
        where: { id },
        data: { isActive: false },
        select: neighborhood,
      }),
    delete: (db, id) =>
      db.neighborhood.delete({ where: { id }, select: { id: true } }),
    async hasReferences(db, id) {
      const { _count } = await db.neighborhood.findUniqueOrThrow({
        where: { id },
        select: {
          _count: {
            select: { addresses: true, deliveryZones: true, branches: true },
          },
        },
      });
      return Object.values(_count).some((count) => count > 0);
    },
  });

  registerAdminGeoResource(api, db, {
    collection: "categories",
    entityType: "FoodCategory",
    createSchema: foodCategoryCreateSchema,
    updateSchema: foodCategoryUpdateSchema,
    list(db, query) {
      geoListQuerySchema.parse(query);
      return db.foodCategory.findMany({
        orderBy: categoryOrder,
        select: category,
      });
    },
    read: (db, id) =>
      db.foodCategory.findUnique({ where: { id }, select: category }),
    create: (db, data) => db.foodCategory.create({ data, select: category }),
    update: (db, { id }, data) =>
      db.foodCategory.update({ where: { id }, data, select: category }),
    deactivate: (db, id) =>
      db.foodCategory.update({
        where: { id },
        data: { isActive: false },
        select: category,
      }),
    delete: (db, id) =>
      db.foodCategory.delete({ where: { id }, select: { id: true } }),
    async hasReferences(db, id) {
      return (
        (await db.restaurantCategory.count({
          where: { categoryId: id },
          take: 1,
        })) === 1
      );
    },
  });
}
