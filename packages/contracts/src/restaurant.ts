import { z } from "zod";
import { syrianPhoneSchema } from "./auth.js";

const requiredText = z.string().trim().min(1);
const uuid = z.uuid();
const nonnegativeMinor = z.number().int().nonnegative();
const timeOfDay = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/u);

export const restaurantStatuses = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
] as const;

export const restaurantProfilePatchSchema = z.strictObject({
  name: requiredText.optional(),
  contactPhone: syrianPhoneSchema.optional(),
  categoryIds: z
    .array(uuid)
    .refine((ids) => new Set(ids).size === ids.length)
    .optional(),
  neighborhoodId: uuid.optional(),
  address: requiredText.optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

export const restaurantBranchParamsSchema = z.strictObject({ branchId: uuid });
export const restaurantIdParamsSchema = z.strictObject({ restaurantId: uuid });
export const deliveryZoneParamsSchema = z.strictObject({ zoneId: uuid });

export const openingPeriodsSchema = z.strictObject({
  periods: z.array(
    z.strictObject({
      dayOfWeek: z.number().int().min(0).max(6),
      opensAt: timeOfDay,
      closesAt: timeOfDay,
    }),
  ),
});

export const restaurantBranchSettingsSchema = z.strictObject({
  minOrderMinor: nonnegativeMinor.optional(),
  pickupEnabled: z.boolean().optional(),
});

const deliveryZoneSchema = z.strictObject({
  neighborhoodId: uuid,
  feeMinor: nonnegativeMinor,
  etaMinutes: z.number().int().min(0).max(2_147_483_647),
});

export const deliveryZonesSchema = z.strictObject({
  zones: z
    .array(deliveryZoneSchema)
    .refine(
      (zones) =>
        new Set(zones.map(({ neighborhoodId }) => neighborhoodId)).size ===
        zones.length,
    ),
});
export const deliveryZonePatchSchema = deliveryZoneSchema
  .omit({ neighborhoodId: true })
  .partial();

export const adminRestaurantListQuerySchema = z.strictObject({
  status: z.enum(restaurantStatuses).optional(),
});
export const restaurantReviewSchema = z.strictObject({ reason: requiredText });
export const restaurantCommissionSchema = z.strictObject({
  commissionRateBps: z.number().int().min(0).max(10_000),
});

export const adminRestaurantCommissionRecordSchema =
  restaurantCommissionSchema.extend({ id: uuid, name: z.string().nullable() });

export const adminRestaurantProfileSummarySchema =
  adminRestaurantCommissionRecordSchema.extend({
    status: z.enum(restaurantStatuses),
    contactPhone: z.string().nullable(),
    logoKey: z.string().nullable(),
    coverImageKey: z.string().nullable(),
    reviewReason: z.string().nullable(),
  });

export const adminRestaurantProfileSchema =
  adminRestaurantProfileSummarySchema.extend({
    categoryIds: z.array(uuid),
    documentCount: z.int().nonnegative(),
    branch: z
      .strictObject({
        id: uuid,
        neighborhoodId: uuid.nullable(),
        address: z.string().nullable(),
        latitude: z.number().nullable(),
        longitude: z.number().nullable(),
        minOrderMinor: nonnegativeMinor,
        pickupEnabled: z.boolean(),
        acceptingOrders: z.boolean(),
        openingPeriods: openingPeriodsSchema.shape.periods,
        deliveryZones: z.array(deliveryZoneSchema.extend({ id: uuid })),
      })
      .nullable(),
  });
