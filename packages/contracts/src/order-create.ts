import { z } from "zod";

const id = z.uuid();
const orderItemInput = z.object({
  menuItemId: id,
  sizeId: id,
  optionIds: z.array(id),
  quantity: z.int().min(1).max(50),
  note: z.string().max(200).nullable().optional(),
});

const fields = {
  branchId: id,
  items: z.array(orderItemInput).min(1),
  note: z.string().max(300).nullable().optional(),
  expectedTotalMinor: z.int().nonnegative(),
};

export const orderIdempotencyKeySchema = id;
export const orderCreateSchema = z.discriminatedUnion("type", [
  z.object({ ...fields, type: z.literal("DELIVERY"), addressId: id }),
  z.object({ ...fields, type: z.literal("PICKUP") }),
]);

export type OrderCreate = z.infer<typeof orderCreateSchema>;
