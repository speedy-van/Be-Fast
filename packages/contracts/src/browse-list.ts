import { z } from "zod";

export const browseAvailabilityReasonSchema = z.enum([
  "UNAPPROVED",
  "PAUSED",
  "CLOSED",
  "OFFLINE",
  "OUT_OF_ZONE",
  "PICKUP_DISABLED",
  "NO_AVAILABLE_ITEMS",
]);

export const browseCategorySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  icon: z.string().nullable(),
  sortOrder: z.number().int(),
});

export const browseListCursorSchema = z.templateLiteral([
  z.enum(["0", "1"]),
  ":",
  z.uuid(),
]);

export const browseListQuerySchema = z.strictObject({
  neighborhoodId: z.uuid(),
  categoryId: z.uuid().optional(),
  q: z.string().trim().optional(),
  cursor: browseListCursorSchema.optional(),
});

export const browseListResponseSchema = z.strictObject({
  restaurants: z
    .array(
      z.strictObject({
        id: z.uuid(),
        branchId: z.uuid(),
        name: z.string().nullable(),
        logoKey: z.string().nullable(),
        categories: z.array(browseCategorySchema),
        isOrderable: z.boolean(),
        reason: browseAvailabilityReasonSchema.nullable(),
        deliveryFeeMinor: z.number().int().nonnegative(),
        minOrderMinor: z.number().int().nonnegative(),
        etaMinutes: z.number().int().nonnegative(),
      }),
    )
    .max(20),
  nextCursor: browseListCursorSchema.nullable(),
  currencyDisplayMode: z.enum(["OLD", "NEW"]),
});

export type BrowseListPage = z.infer<typeof browseListResponseSchema>;
