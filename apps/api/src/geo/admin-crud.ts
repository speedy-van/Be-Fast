import { geoIdParamsSchema } from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodType } from "zod";
import { writeAdminAudit } from "../audit.js";
import { requireAdminRole } from "../auth/access.js";
import { ApiError } from "../errors.js";
import { Prisma, type PrismaClient } from "../generated/prisma/client.ts";

const tables = {
  Governorate: Prisma.sql`"Governorate"`,
  City: Prisma.sql`"City"`,
  Neighborhood: Prisma.sql`"Neighborhood"`,
  FoodCategory: Prisma.sql`"FoodCategory"`,
};

type Entity = keyof typeof tables;
type GeoRow = Prisma.InputJsonObject & { id: string; isActive: boolean };
type Transaction = Prisma.TransactionClient;

const actions: Record<Entity, string> = {
  Governorate: "GOVERNORATE",
  City: "CITY",
  Neighborhood: "NEIGHBORHOOD",
  FoodCategory: "FOOD_CATEGORY",
};

interface GeoResource<Create, Update, Row extends GeoRow> {
  collection: string;
  entityType: Entity;
  createSchema: ZodType<Create>;
  updateSchema: ZodType<Update>;
  list(db: PrismaClient, query: unknown): Promise<Row[]>;
  read(db: Transaction, id: string): Promise<Row | null>;
  create(db: Transaction, input: Create): Promise<Row>;
  update(db: Transaction, row: Row, input: Update): Promise<Row>;
  deactivate(db: Transaction, id: string): Promise<Row>;
  delete(db: Transaction, id: string): Promise<unknown>;
  hasReferences(db: Transaction, id: string): Promise<boolean>;
}

export async function lockGeoRow(tx: Transaction, entity: Entity, id: string) {
  // A row lock keeps audit snapshots consistent and blocks concurrent FK inserts.
  const rows = await tx.$queryRaw<{ isActive: boolean }[]>`
    SELECT "isActive" FROM ${tables[entity]} WHERE "id" = ${id}::uuid FOR UPDATE
  `;
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND");
  return rows[0];
}

export function registerAdminGeoResource<Create, Update, Row extends GeoRow>(
  api: FastifyInstance,
  db: PrismaClient,
  resource: GeoResource<Create, Update, Row>,
): void {
  const { entityType } = resource;
  const collection = `/admin/${resource.collection}`;
  const path = `${collection}/:id`;
  const action = actions[entityType];
  const allowed = { preHandler: requireAdminRole("OPERATIONS", "SUPER_ADMIN") };

  async function fetchOrFail(tx: Transaction, id: string) {
    const row = await resource.read(tx, id);
    if (!row) throw new ApiError(404, "NOT_FOUND");
    return row;
  }

  api.get(collection, allowed, (request) => resource.list(db, request.query));

  api.get(path, allowed, (request) => {
    const { id } = geoIdParamsSchema.parse(request.params);
    return fetchOrFail(db, id);
  });

  api.post(collection, allowed, async (request, reply) => {
    const input = resource.createSchema.parse(request.body);
    const row = await db.$transaction(async (tx) => {
      const after = await resource.create(tx, input);
      await writeAdminAudit(tx, request, {
        action: `${action}_CREATED`,
        entityType,
        entityId: after.id,
        after,
      });
      return after;
    });
    return reply.code(201).send(row);
  });

  api.patch(path, allowed, (request) => {
    const { id } = geoIdParamsSchema.parse(request.params);
    const input = resource.updateSchema.parse(request.body);
    return db.$transaction(async (tx) => {
      await lockGeoRow(tx, entityType, id);
      const before = await fetchOrFail(tx, id);
      const after = await resource.update(tx, before, input);
      await writeAdminAudit(tx, request, {
        action: `${action}_UPDATED`,
        entityType,
        entityId: id,
        before,
        after,
      });
      return after;
    });
  });

  api.delete(path, allowed, async (request, reply) => {
    const { id } = geoIdParamsSchema.parse(request.params);
    const remaining = await db.$transaction(async (tx) => {
      await lockGeoRow(tx, entityType, id);
      const before = await fetchOrFail(tx, id);

      if (await resource.hasReferences(tx, id)) {
        if (!before.isActive) return before;
        const after = await resource.deactivate(tx, id);
        await writeAdminAudit(tx, request, {
          action: `${action}_DEACTIVATED`,
          entityType,
          entityId: id,
          before,
          after,
        });
        return after;
      }

      await resource.delete(tx, id);
      await writeAdminAudit(tx, request, {
        action: `${action}_DELETED`,
        entityType,
        entityId: id,
        before,
      });
      return null;
    });
    return remaining ? reply.send(remaining) : reply.code(204).send();
  });
}
