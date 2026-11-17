import { z } from "zod";

const id = z.uuid();
const name = z.string().trim().min(1).max(120);
const isActive = z.boolean();
const icon = z.string().trim().min(1).max(160).nullable();
const sortOrder = z.int().min(0).max(2_147_483_647);

const placeFields = { name, isActive: isActive.optional() };
const categoryFields = {
  ...placeFields,
  icon: icon.optional(),
  sortOrder: sortOrder.optional(),
};

const nonempty = (value: object) => Object.keys(value).length > 0;

export const geoIdParamsSchema = z.strictObject({ id });
export const geoListQuerySchema = z.strictObject({});
export const governorateCreateSchema = z.strictObject(placeFields);
export const governorateUpdateSchema = governorateCreateSchema
  .partial()
  .refine(nonempty);
export const cityCreateSchema = z.strictObject({
  ...placeFields,
  governorateId: id,
});
export const cityUpdateSchema = cityCreateSchema.partial().refine(nonempty);
export const cityListQuerySchema = z.strictObject({
  governorateId: id.optional(),
});
export const neighborhoodCreateSchema = z.strictObject({
  ...placeFields,
  cityId: id,
});
export const neighborhoodUpdateSchema = neighborhoodCreateSchema
  .partial()
  .refine(nonempty);
export const neighborhoodListQuerySchema = z.strictObject({
  cityId: id.optional(),
});
export const foodCategoryCreateSchema = z.strictObject(categoryFields);
export const foodCategoryUpdateSchema = foodCategoryCreateSchema
  .partial()
  .refine(nonempty);

const publicPlaceSchema = z.object({ id, name });
const publicCitySchema = publicPlaceSchema.extend({
  neighborhoods: z.array(publicPlaceSchema),
});
const publicGovernorateSchema = publicPlaceSchema.extend({
  cities: z.array(publicCitySchema),
});

export const publicGeoSchema = z.array(publicGovernorateSchema);
export const publicFoodCategorySchema = z.object({ id, name, icon, sortOrder });
export const publicFoodCategoriesSchema = z.array(publicFoodCategorySchema);

export const governorateSchema = publicPlaceSchema.extend({ isActive });
export const citySchema = governorateSchema.extend({ governorateId: id });
export const neighborhoodSchema = governorateSchema.extend({ cityId: id });
export const foodCategorySchema = publicFoodCategorySchema.extend({ isActive });
