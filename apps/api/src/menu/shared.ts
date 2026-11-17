import { requireRestaurantRole } from "../auth/access.js";
import { ApiError } from "../errors.js";
import type { Prisma } from "../generated/prisma/client.ts";

export const menuEditors = {
  preHandler: requireRestaurantRole("OWNER", "MANAGER"),
};
export const menuReaders = {
  preHandler: requireRestaurantRole("OWNER", "MANAGER", "CASHIER", "KITCHEN"),
};

export function menuItemScope(restaurantId: string): Prisma.MenuItemWhereInput {
  return { deletedAt: null, section: { restaurantId, deletedAt: null } };
}

export function minorNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new ApiError(500, "INTERNAL_ERROR");
  return number;
}

export async function lockMenu(
  tx: Prisma.TransactionClient,
  restaurantId: string,
) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Restaurant" WHERE "id" = ${restaurantId}::uuid FOR UPDATE
  `;
  if (!rows.length) throw new ApiError(404, "NOT_FOUND");
}
