import { isOpenAt, type OpeningPeriod } from "./hours.js";
import type { OrderType } from "./order-state.js";

export type RestaurantStatus =
  "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED";

export type UnavailabilityReason =
  | "UNAPPROVED"
  | "PAUSED"
  | "CLOSED"
  | "OFFLINE"
  | "OUT_OF_ZONE"
  | "PICKUP_DISABLED"
  | "NO_AVAILABLE_ITEMS";

export type OrderAvailability =
  | { readonly isOrderable: true; readonly reason: null }
  | { readonly isOrderable: false; readonly reason: UnavailabilityReason };

export interface AvailabilityInput {
  readonly restaurantStatus: RestaurantStatus;
  readonly orderType: OrderType;
  readonly acceptingOrders: boolean;
  readonly periods: readonly OpeningPeriod[];
  readonly instantUtc: Date;
  readonly lastSeenAt: Date | null;
  readonly hasDeliveryZone: boolean;
  readonly pickupEnabled: boolean;
  readonly hasAvailableItem: boolean;
}

const offlineAfterMs = 120_000;

function unavailabilityReason(
  input: AvailabilityInput,
): UnavailabilityReason | null {
  if (input.restaurantStatus !== "APPROVED") return "UNAPPROVED";
  if (!input.acceptingOrders) return "PAUSED";
  if (!isOpenAt(input.periods, input.instantUtc)) return "CLOSED";
  if (
    input.lastSeenAt === null ||
    input.instantUtc.getTime() - input.lastSeenAt.getTime() > offlineAfterMs
  ) {
    return "OFFLINE";
  }
  if (input.orderType === "DELIVERY" && !input.hasDeliveryZone)
    return "OUT_OF_ZONE";
  if (input.orderType === "PICKUP" && !input.pickupEnabled)
    return "PICKUP_DISABLED";
  if (!input.hasAvailableItem) return "NO_AVAILABLE_ITEMS";
  return null;
}

export function getOrderAvailability(
  input: AvailabilityInput,
): OrderAvailability {
  const reason = unavailabilityReason(input);
  return reason === null
    ? { isOrderable: true, reason }
    : { isOrderable: false, reason };
}

export function isOrderable(input: AvailabilityInput): boolean {
  return getOrderAvailability(input).isOrderable;
}
