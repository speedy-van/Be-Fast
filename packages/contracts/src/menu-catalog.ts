import { z } from "zod";

const id = z.uuid();
const requiredText = z.string().trim().min(1);
const sortOrder = z.number().int().min(-2_147_483_648).max(2_147_483_647);
const priceMinor = z.number().int().nonnegative();
const itemTime = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/u);

export const menuSectionPathSchema = z.strictObject({ sectionId: id });
export const menuItemPathSchema = z.strictObject({ itemId: id });
export const menuSizePathSchema = z.strictObject({ sizeId: id });

export const createMenuSectionSchema = z.strictObject({
  name: requiredText,
  sortOrder: sortOrder.optional(),
});
export const patchMenuSectionSchema = createMenuSectionSchema.partial();

export const createMenuSizeSchema = z.strictObject({
  name: requiredText,
  priceMinor,
  sortOrder: sortOrder.optional(),
});
export const patchMenuSizeSchema = createMenuSizeSchema.partial();

const itemMetadataSchema = z.strictObject({
  sectionId: id,
  name: requiredText,
  description: z.string().nullable().optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: sortOrder.optional(),
  availableFrom: itemTime.nullable().optional(),
  availableTo: itemTime.nullable().optional(),
});

export const createMenuItemSchema = itemMetadataSchema.extend({
  sizes: z
    .array(createMenuSizeSchema.partial({ name: true }))
    .min(1)
    .refine(
      (sizes) =>
        sizes.length === 1 || sizes.every(({ name }) => name !== undefined),
    ),
});
export const patchMenuItemSchema = itemMetadataSchema.partial();

const restaurantMenuOptionSchema = z.strictObject({
  id,
  optionGroupId: id,
  name: z.string(),
  priceMinor,
  isAvailable: z.boolean(),
  sortOrder,
});
const restaurantMenuGroupSchema = z.strictObject({
  id,
  menuItemId: id,
  name: z.string(),
  minSelect: z.int().nonnegative(),
  maxSelect: z.int().nonnegative(),
  sortOrder,
  options: z.array(restaurantMenuOptionSchema),
});
const restaurantMenuSizeSchema = z.strictObject({
  id,
  menuItemId: id,
  name: z.string(),
  priceMinor,
  sortOrder,
});
const restaurantMenuItemSchema = z.strictObject({
  id,
  sectionId: id,
  name: z.string(),
  description: z.string().nullable(),
  imageKey: z.string().nullable(),
  isAvailable: z.boolean(),
  sortOrder,
  availableFrom: itemTime.nullable(),
  availableTo: itemTime.nullable(),
  sizes: z.array(restaurantMenuSizeSchema),
  optionGroups: z.array(restaurantMenuGroupSchema),
});
const restaurantMenuSectionSchema = z.strictObject({
  id,
  name: z.string(),
  sortOrder,
  items: z.array(restaurantMenuItemSchema),
});

export const restaurantMenuSchema = z.strictObject({
  sections: z.array(restaurantMenuSectionSchema),
});

export type RestaurantMenu = z.infer<typeof restaurantMenuSchema>;
export type RestaurantMenuSection = z.infer<typeof restaurantMenuSectionSchema>;
export type RestaurantMenuItem = z.infer<typeof restaurantMenuItemSchema>;
export type RestaurantMenuSize = z.infer<typeof restaurantMenuSizeSchema>;
export type RestaurantMenuGroup = z.infer<typeof restaurantMenuGroupSchema>;
export type RestaurantMenuOption = z.infer<typeof restaurantMenuOptionSchema>;
