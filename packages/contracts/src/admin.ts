import { ADMIN_ROLES } from "@be-fast/domain";
import { z } from "zod";
import { syrianPhoneSchema } from "./auth.js";
import { orderReadSchema } from "./order-read.js";

const id = z.uuid();
const count = z.int().nonnegative();
const instant = z.iso.datetime();
const currencyDisplayMode = z.enum(["OLD", "NEW"]);
const role = z.enum(ADMIN_ROLES);

export const adminResourceParamsSchema = z.strictObject({ id });

export const adminSessionSchema = z.strictObject({
  id,
  role,
  currencyDisplayMode,
});
export const adminDashboardSchema = z.strictObject({
  activeOrderCount: count.nullable(),
  needsAttentionCount: count.nullable(),
  pendingRestaurantCount: count.nullable(),
  offlineBranches: z
    .array(
      z.strictObject({
        id,
        restaurantId: id,
        restaurantName: z.string().nullable(),
        lastSeenAt: instant.nullable(),
      }),
    )
    .nullable(),
});

export const adminCustomerSearchQuerySchema = z.strictObject({
  phone: syrianPhoneSchema,
});
export const adminCustomerSchema = z.strictObject({
  id,
  name: z.string().nullable(),
  phone: z.string().nullable(),
  blockedAt: instant.nullable(),
  createdAt: instant,
});
export const adminCustomerSearchSchema = z.strictObject({
  customers: z.array(adminCustomerSchema),
});
export const adminCustomerDetailSchema = z.strictObject({
  customer: adminCustomerSchema,
  orders: z.array(orderReadSchema),
});
export const adminCustomerBlockSchema = z.strictObject({
  blocked: z.boolean(),
  reason: z.string().trim().min(1).max(500),
});

export const adminUserSchema = z.strictObject({
  id,
  email: z.email(),
  role,
  isActive: z.boolean(),
  createdAt: instant,
});
export const adminUserListSchema = z.strictObject({
  users: z.array(adminUserSchema),
});
export const adminUserRoleSchema = z.strictObject({ role });

// Keep second-to-millisecond conversion and Date arithmetic within supported bounds.
const orderTimeoutSeconds = z.int().min(1).max(2_147_483_647);
export const adminSettingsSchema = z.strictObject({
  reminderAfterSec: orderTimeoutSeconds,
  attentionAfterSec: orderTimeoutSeconds,
  expireAfterSec: orderTimeoutSeconds,
  defaultCommissionRateBps: z.int().min(0).max(10_000),
  currencyDisplayMode,
});
export const adminSettingsPatchSchema = adminSettingsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0);
export type AdminSettings = z.infer<typeof adminSettingsSchema>;

export const adminAuditLogQuerySchema = z.strictObject({
  entityId: z.string().trim().min(1).max(200).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  cursor: id.optional(),
});
export const adminAuditLogSchema = z.strictObject({
  entries: z.array(
    z.strictObject({
      id,
      adminUserId: id,
      action: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      before: z.json(),
      after: z.json(),
      ip: z.string(),
      createdAt: instant,
    }),
  ),
  nextCursor: id.nullable(),
});
