import { z } from "zod";

export const menuItemIdSchema = z.strictObject({ itemId: z.uuid() });
export const menuOptionIdSchema = z.strictObject({ optionId: z.uuid() });
export const menuAvailabilitySchema = z.strictObject({
  isAvailable: z.boolean(),
});
export const branchAcceptingOrdersSchema = z.strictObject({
  acceptingOrders: z.boolean(),
});
