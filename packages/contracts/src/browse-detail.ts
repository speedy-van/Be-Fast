import { z } from "zod";
import {
  browseAvailabilityReasonSchema,
  browseCategorySchema,
} from "./browse-list.js";

const uuid = z.uuid();
const minor = z.number().int().nonnegative();
const sortOrder = z.number().int();
const minuteOfDay = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/u);
const menuChoice = z.strictObject({
  id: uuid,
  name: z.string(),
  priceMinor: minor,
  sortOrder,
});
const menuOption = menuChoice.extend({ isAvailable: z.boolean() });
const menuOptionGroup = z.strictObject({
  id: uuid,
  name: z.string(),
  minSelect: z.number().int().nonnegative(),
  maxSelect: z.number().int().nonnegative(),
  sortOrder,
  options: z.array(menuOption),
});
const menuItem = z.strictObject({
  id: uuid,
  name: z.string(),
  description: z.string().nullable(),
  imageKey: z.string().nullable(),
  isAvailable: z.boolean(),
  sortOrder,
  availableFrom: minuteOfDay.nullable(),
  availableTo: minuteOfDay.nullable(),
  sizes: z.array(menuChoice),
  optionGroups: z.array(menuOptionGroup),
});
const menuSection = z.strictObject({
  id: uuid,
  name: z.string(),
  sortOrder,
  items: z.array(menuItem),
});

export const publicRestaurantDetailParamsSchema = z.strictObject({ id: uuid });
export const publicRestaurantDetailQuerySchema = z.strictObject({
  neighborhoodId: uuid,
});

export const publicRestaurantDetailResponseSchema = z.strictObject({
  id: uuid,
  branchId: uuid,
  name: z.string().nullable(),
  logoKey: z.string().nullable(),
  coverImageKey: z.string().nullable(),
  contactPhone: z.string().nullable(),
  categories: z.array(browseCategorySchema),
  isOrderable: z.boolean(),
  reason: browseAvailabilityReasonSchema.nullable(),
  deliveryFeeMinor: minor,
  minOrderMinor: minor,
  etaMinutes: z.number().int().nonnegative(),
  pickupEnabled: z.boolean(),
  currencyDisplayMode: z.enum(["OLD", "NEW"]),
  sections: z.array(menuSection),
});

export type PublicRestaurantDetailResponse = z.infer<
  typeof publicRestaurantDetailResponseSchema
>;
