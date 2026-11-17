import { normalizeSyrianPhone } from "@be-fast/domain";
import { z } from "zod";

export const syrianPhoneSchema = z.string().transform((input, context) => {
  const normalized = normalizeSyrianPhone(input);
  if (normalized === null) {
    context.addIssue({
      code: "custom",
      message: "Invalid Syrian mobile number.",
    });
    return z.NEVER;
  }
  return normalized;
});

export const adminEmailSchema = z.string().trim().toLowerCase().pipe(z.email());

const sixDigitCodeSchema = z.string().regex(/^[0-9]{6}$/u);

export const customerOtpRequestSchema = z.object({ phone: syrianPhoneSchema });
export const customerOtpVerifySchema = customerOtpRequestSchema.extend({
  code: sixDigitCodeSchema,
});

export const restaurantRegisterSchema = customerOtpVerifySchema.extend({
  password: z.string().min(8),
});

export const restaurantLoginSchema = z.object({
  phone: syrianPhoneSchema,
  password: z.string().min(1),
});

export const adminLoginSchema = z.object({
  email: adminEmailSchema,
  password: z.string().min(1),
  totp: sixDigitCodeSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
});

export const authTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: refreshTokenSchema.shape.refreshToken,
});

export type AuthTokens = z.infer<typeof authTokensSchema>;
