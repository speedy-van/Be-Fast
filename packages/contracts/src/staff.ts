import { z } from "zod";
import { newPasswordSchema, syrianPhoneSchema } from "./auth.js";

export const restaurantStaffRoleSchema = z.enum([
  "MANAGER",
  "CASHIER",
  "KITCHEN",
]);

export const restaurantStaffParamsSchema = z.strictObject({
  staffId: z.uuid(),
});

export const restaurantStaffCreateSchema = z.strictObject({
  phone: syrianPhoneSchema,
  temporaryPassword: newPasswordSchema,
  role: restaurantStaffRoleSchema,
});

export const restaurantStaffUpdateSchema = z.strictObject({
  role: restaurantStaffRoleSchema,
});

export const restaurantStaffMemberSchema = z.object({
  id: z.uuid(),
  phone: syrianPhoneSchema,
  role: restaurantStaffRoleSchema,
  isActive: z.boolean(),
  passwordChangeRequired: z.boolean(),
});

export const restaurantStaffListSchema = z.array(restaurantStaffMemberSchema);
