import { z } from "zod";

const uuid = z.uuid();
const name = z.string().trim().min(1);
const selectionCount = z.number().int().min(0).max(2_147_483_647);
const sortOrder = z.number().int().min(-2_147_483_648).max(2_147_483_647);

export const menuOptionGroupsParamsSchema = z.strictObject({ itemId: uuid });
export const menuOptionGroupParamsSchema = z.strictObject({ groupId: uuid });
export const menuOptionParamsSchema = z.strictObject({ optionId: uuid });

export const createMenuOptionSchema = z.strictObject({
  name,
  priceMinor: z.number().int().nonnegative(),
  isAvailable: z.boolean().optional(),
  sortOrder: sortOrder.optional(),
});
export const patchMenuOptionSchema = createMenuOptionSchema.partial();

const optionGroupFieldsSchema = z.strictObject({
  name,
  minSelect: selectionCount,
  maxSelect: selectionCount,
  sortOrder: sortOrder.optional(),
});

export const createMenuOptionGroupSchema = optionGroupFieldsSchema.extend({
  options: z.array(createMenuOptionSchema).default([]),
});
export const patchMenuOptionGroupSchema = optionGroupFieldsSchema.partial();
