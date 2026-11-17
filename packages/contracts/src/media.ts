import { z } from "zod";

export const restaurantImagePathSchema = z.object({
  kind: z.enum(["logo", "cover"]),
});

export const restaurantImageUploadSchema = z.object({
  key: z.string(),
  images: z.object({ "320": z.string(), "640": z.string() }),
});

export const restaurantDocumentTypeSchema = z.enum([
  "BUSINESS_REGISTRATION",
  "LICENSE",
]);
export const restaurantDocumentPathSchema = z.object({
  type: restaurantDocumentTypeSchema,
});
export const documentIdPathSchema = z.object({ documentId: z.uuid() });
export const adminDocumentPathSchema = documentIdPathSchema.extend({
  restaurantId: z.uuid(),
});

export const signedDocumentQuerySchema = z.object({
  expires: z
    .string()
    .regex(/^[0-9]{1,16}$/u)
    .transform(Number)
    .pipe(z.int().positive()),
  signature: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
});

export const publicImagePathSchema = z.object({
  restaurantId: z.uuid(),
  assetId: z.uuid(),
  width: z.enum(["320", "640"]),
});

export const restaurantDocumentSchema = z.object({
  id: z.uuid(),
  type: restaurantDocumentTypeSchema,
  createdAt: z.iso.datetime(),
});

export const documentLinkSchema = z.object({
  url: z.string().startsWith("/admin/"),
  expiresAt: z.iso.datetime(),
});
