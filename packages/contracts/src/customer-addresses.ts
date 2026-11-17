import { z } from "zod";
import { syrianPhoneSchema } from "./auth.js";

const id = z.uuid();
const name = z.string().trim().min(1).max(120);
const latitude = z.number().min(-90).max(90).nullable();
const longitude = z.number().min(-180).max(180).nullable();
const addressFields = z.strictObject({
  neighborhoodId: id,
  street: z.string().trim().min(1).max(200),
  landmark: z.string().trim().min(1).max(200),
  building: z.string().trim().min(1).max(100).nullable().optional(),
  floor: z.string().trim().min(1).max(50).nullable().optional(),
  notes: z.string().trim().min(1).max(500).nullable().optional(),
  label: z.string().trim().min(1).max(60).nullable().optional(),
  latitude: latitude.optional(),
  longitude: longitude.optional(),
});

function hasPairedCoordinates(value: {
  latitude?: number | null;
  longitude?: number | null;
}): boolean {
  return (
    typeof value.latitude === typeof value.longitude &&
    (value.latitude === null) === (value.longitude === null)
  );
}

export const customerAddressParamsSchema = z.strictObject({ addressId: id });
export const customerAddressCreateSchema =
  addressFields.refine(hasPairedCoordinates);
export const customerAddressUpdateSchema = addressFields
  .partial()
  .refine((value) => Object.keys(value).length > 0)
  .refine(hasPairedCoordinates);
export const customerAddressSchema = addressFields
  .required()
  .extend({ id, isDefault: z.boolean() });
export const customerAddressListSchema = z.array(customerAddressSchema);

export const customerProfileSchema = z.object({
  id,
  name: name.nullable(),
  phone: syrianPhoneSchema.nullable(),
});
export const customerProfileUpdateSchema = z.strictObject({ name });
