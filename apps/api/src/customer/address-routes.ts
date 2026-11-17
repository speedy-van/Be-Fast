import {
  customerAddressCreateSchema,
  customerAddressParamsSchema,
  customerAddressUpdateSchema,
  customerProfileUpdateSchema,
} from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import { requireCustomer } from "../auth/access.js";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";

type Database = Prisma.TransactionClient;

const profileFields = { id: true, name: true, phone: true } as const;
const addressFields = {
  id: true,
  neighborhoodId: true,
  street: true,
  landmark: true,
  building: true,
  floor: true,
  notes: true,
  label: true,
  latitude: true,
  longitude: true,
  isDefault: true,
} as const;
const addressOrder = [
  { createdAt: "asc" },
  { id: "asc" },
] satisfies Prisma.CustomerAddressOrderByWithRelationInput[];

async function lockCustomer(tx: Database, customerId: string): Promise<void> {
  // Address and profile mutations serialize on the owner, even before any address exists.
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Customer" WHERE "id" = ${customerId}::uuid AND "deletedAt" IS NULL FOR UPDATE
  `;
  if (rows.length !== 1) throw new ApiError(404, "NOT_FOUND");
}

async function validateNeighborhood(
  tx: Database,
  neighborhoodId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT n."id"
    FROM "Neighborhood" AS n
    JOIN "City" AS c ON c."id" = n."cityId"
    JOIN "Governorate" AS g ON g."id" = c."governorateId"
    WHERE n."id" = ${neighborhoodId}::uuid AND n."isActive" AND c."isActive" AND g."isActive"
    FOR SHARE OF n, c, g
  `;
  if (rows.length !== 1) throw new ApiError(400, "VALIDATION_ERROR");
}

async function readProfile(db: Database, id: string) {
  const customer = await db.customer.findUnique({
    where: { id, deletedAt: null },
    select: profileFields,
  });
  if (!customer) throw new ApiError(404, "NOT_FOUND");
  return customer;
}

async function readAddress(db: Database, customerId: string, id: string) {
  const address = await db.customerAddress.findUnique({
    where: { id, customerId },
    select: addressFields,
  });
  if (!address) throw new ApiError(404, "NOT_FOUND");
  return address;
}

async function makeDefault(tx: Database, customerId: string, id: string) {
  await tx.customerAddress.updateMany({
    where: { customerId, id: { not: id }, isDefault: true },
    data: { isDefault: false },
  });
  return tx.customerAddress.update({
    where: { id, customerId },
    data: { isDefault: true },
    select: addressFields,
  });
}

export function registerCustomerAddressRoutes(
  api: FastifyInstance,
  { db }: { db: PrismaClient },
): void {
  api.get("/customer/me", (request) =>
    readProfile(db, requireCustomer(request).sub),
  );

  api.patch("/customer/me", (request) => {
    const { sub: customerId } = requireCustomer(request);
    const { name } = customerProfileUpdateSchema.parse(request.body);
    return db.$transaction(async (tx) => {
      await lockCustomer(tx, customerId);
      const current = await readProfile(tx, customerId);
      if (current.name === name) return current;
      if (current.name !== null) throw new ApiError(409, "CONFLICT");
      return tx.customer.update({
        where: { id: customerId },
        data: { name },
        select: profileFields,
      });
    });
  });

  api.get("/customer/addresses", (request) => {
    const { sub: customerId } = requireCustomer(request);
    return db.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: "desc" }, ...addressOrder],
      select: addressFields,
    });
  });

  api.get("/customer/addresses/:addressId", (request) => {
    const { sub: customerId } = requireCustomer(request);
    const { addressId } = customerAddressParamsSchema.parse(request.params);
    return readAddress(db, customerId, addressId);
  });

  api.post("/customer/addresses", async (request, reply) => {
    const { sub: customerId } = requireCustomer(request);
    const input = customerAddressCreateSchema.parse(request.body);
    const address = await db.$transaction(async (tx) => {
      await lockCustomer(tx, customerId);
      await validateNeighborhood(tx, input.neighborhoodId);
      const currentDefault = await tx.customerAddress.findFirst({
        where: { customerId, isDefault: true },
        select: { id: true },
      });
      return tx.customerAddress.create({
        data: { ...input, customerId, isDefault: currentDefault === null },
        select: addressFields,
      });
    });
    return reply.code(201).send(address);
  });

  api.patch("/customer/addresses/:addressId", (request) => {
    const { sub: customerId } = requireCustomer(request);
    const { addressId } = customerAddressParamsSchema.parse(request.params);
    const input = customerAddressUpdateSchema.parse(request.body);
    return db.$transaction(async (tx) => {
      await lockCustomer(tx, customerId);
      await readAddress(tx, customerId, addressId);
      if (input.neighborhoodId !== undefined)
        await validateNeighborhood(tx, input.neighborhoodId);
      return tx.customerAddress.update({
        where: { id: addressId, customerId },
        data: input,
        select: addressFields,
      });
    });
  });

  api.patch("/customer/addresses/:addressId/default", (request) => {
    const { sub: customerId } = requireCustomer(request);
    const { addressId } = customerAddressParamsSchema.parse(request.params);
    return db.$transaction(async (tx) => {
      await lockCustomer(tx, customerId);
      const address = await readAddress(tx, customerId, addressId);
      return address.isDefault
        ? address
        : makeDefault(tx, customerId, addressId);
    });
  });

  api.delete("/customer/addresses/:addressId", async (request, reply) => {
    const { sub: customerId } = requireCustomer(request);
    const { addressId } = customerAddressParamsSchema.parse(request.params);
    await db.$transaction(async (tx) => {
      await lockCustomer(tx, customerId);
      const address = await readAddress(tx, customerId, addressId);
      await tx.customerAddress.delete({
        where: { id: addressId, customerId },
        select: { id: true },
      });
      if (address.isDefault) {
        const next = await tx.customerAddress.findFirst({
          where: { customerId },
          orderBy: addressOrder,
          select: { id: true },
        });
        if (next) await makeDefault(tx, customerId, next.id);
      }
    });
    return reply.code(204).send();
  });
}
