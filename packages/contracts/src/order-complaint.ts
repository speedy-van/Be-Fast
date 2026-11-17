import { z } from "zod";

export const complaintTypes = ["NOT_RECEIVED", "OTHER"] as const;
export const complaintStatuses = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
const complaintType = z.enum(complaintTypes);
const complaintStatus = z.enum(complaintStatuses);
const complaintFields = {
  id: z.uuid(),
  orderId: z.uuid(),
  type: complaintType,
  text: z.string().max(1_000),
  status: complaintStatus,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

export const complaintParamsSchema = z.strictObject({ id: z.uuid() });
export const createComplaintSchema = z.strictObject({
  type: complaintType,
  text: z.string().trim().min(1).max(1_000),
});
export const customerComplaintSchema = z.strictObject(complaintFields);
export const customerComplaintResponseSchema = z.strictObject({
  complaint: customerComplaintSchema.nullable(),
});
export const adminComplaintSchema = z.strictObject({
  ...complaintFields,
  customerId: z.uuid(),
  internalNotes: z.string().nullable(),
  nonDeliveryVerifiedAt: z.iso.datetime().nullable(),
});
export const adminComplaintListSchema = z.strictObject({
  complaints: z.array(adminComplaintSchema),
});
export const adminComplaintListQuerySchema = z.strictObject({
  status: complaintStatus.optional(),
  type: complaintType.optional(),
});
export const reviewComplaintSchema = z
  .strictObject({
    status: complaintStatus.optional(),
    internalNotes: z.string().trim().nullable().optional(),
    verifyNonDelivery: z.literal(true).optional(),
  })
  .refine((fields) => Object.keys(fields).length > 0);
