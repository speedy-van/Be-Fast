import {
  restaurantStaffCreateSchema,
  restaurantStaffParamsSchema,
  restaurantStaffUpdateSchema,
} from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import { requireRestaurant, requireRestaurantRole } from "../auth/access.js";
import { hashPassword } from "../auth/credentials.js";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";

const ownerOnly = { preHandler: requireRestaurantRole("OWNER") };
const staffRoleFilter = {
  not: "OWNER",
} satisfies Prisma.EnumRestaurantRoleFilter;
const staffFields = {
  id: true,
  phone: true,
  role: true,
  isActive: true,
  passwordChangeRequired: true,
} as const;

export function registerStaffRoutes(
  api: FastifyInstance,
  { db }: { db: PrismaClient },
): void {
  api.get("/restaurant/staff", ownerOnly, async (request) => {
    const { restaurantId } = requireRestaurant(request);
    return db.restaurantUser.findMany({
      where: { restaurantId, role: staffRoleFilter },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: staffFields,
    });
  });

  api.post("/restaurant/staff", ownerOnly, async (request, reply) => {
    const { restaurantId } = requireRestaurant(request);
    const { phone, temporaryPassword, role } =
      restaurantStaffCreateSchema.parse(request.body);
    const [staff] = await db.restaurantUser.createManyAndReturn({
      data: [
        {
          restaurantId,
          phone,
          passwordHash: await hashPassword(temporaryPassword),
          role,
          passwordChangeRequired: true,
        },
      ],
      skipDuplicates: true,
      select: staffFields,
    });
    if (!staff) throw new ApiError(409, "CONFLICT");

    return reply.code(201).send(staff);
  });

  api.patch("/restaurant/staff/:staffId", ownerOnly, async (request) => {
    const { restaurantId } = requireRestaurant(request);
    const { staffId } = restaurantStaffParamsSchema.parse(request.params);
    const { role } = restaurantStaffUpdateSchema.parse(request.body);
    const [staff] = await db.restaurantUser.updateManyAndReturn({
      where: { id: staffId, restaurantId, role: staffRoleFilter },
      data: { role },
      select: staffFields,
    });
    if (!staff) throw new ApiError(404, "NOT_FOUND");

    return staff;
  });

  api.delete(
    "/restaurant/staff/:staffId",
    ownerOnly,
    async (request, reply) => {
      const { restaurantId } = requireRestaurant(request);
      const { staffId } = restaurantStaffParamsSchema.parse(request.params);
      const disabled = await db.restaurantUser.updateMany({
        where: { id: staffId, restaurantId, role: staffRoleFilter },
        data: { isActive: false },
      });
      if (disabled.count !== 1) throw new ApiError(404, "NOT_FOUND");

      return reply.code(204).send();
    },
  );
}
