import { describe, expect, it } from "vitest";
import {
  getOrderAvailability,
  isOrderable,
  type AvailabilityInput,
  type UnavailabilityReason,
} from "../src/availability.js";

const orderable: AvailabilityInput = {
  restaurantStatus: "APPROVED",
  orderType: "DELIVERY",
  acceptingOrders: true,
  periods: [{ dayOfWeek: 0, opensAt: "09:00", closesAt: "18:00" }],
  instantUtc: new Date("2026-01-04T10:00:00.000Z"),
  lastSeenAt: new Date("2026-01-04T09:59:00.000Z"),
  hasDeliveryZone: true,
  pickupEnabled: false,
  hasAvailableItem: true,
};

describe("restaurant availability", () => {
  it("allows delivery in a served neighborhood when all other checks pass", () => {
    expect(getOrderAvailability(orderable)).toEqual({
      isOrderable: true,
      reason: null,
    });
    expect(isOrderable(orderable)).toBe(true);
  });

  it("allows enabled pickup without a delivery zone", () => {
    expect(
      isOrderable({
        ...orderable,
        orderType: "PICKUP",
        hasDeliveryZone: false,
        pickupEnabled: true,
      }),
    ).toBe(true);
  });

  const failures: [Partial<AvailabilityInput>, UnavailabilityReason][] = [
    [{ restaurantStatus: "DRAFT" }, "UNAPPROVED"],
    [{ restaurantStatus: "PENDING_REVIEW" }, "UNAPPROVED"],
    [{ restaurantStatus: "REJECTED" }, "UNAPPROVED"],
    [{ restaurantStatus: "SUSPENDED" }, "UNAPPROVED"],
    [{ acceptingOrders: false, lastSeenAt: null }, "PAUSED"],
    [{ periods: [], lastSeenAt: null }, "CLOSED"],
    [{ lastSeenAt: null }, "OFFLINE"],
    [{ lastSeenAt: new Date("2026-01-04T09:57:59.999Z") }, "OFFLINE"],
    [{ hasDeliveryZone: false, pickupEnabled: true }, "OUT_OF_ZONE"],
    [{ orderType: "PICKUP" }, "PICKUP_DISABLED"],
    [{ hasAvailableItem: false }, "NO_AVAILABLE_ITEMS"],
  ];

  it.each(failures)("rejects %o with %s", (change, reason) => {
    const input = { ...orderable, ...change };
    expect(getOrderAvailability(input)).toEqual({ isOrderable: false, reason });
    expect(isOrderable(input)).toBe(false);
  });

  it("stays online when last seen exactly 120 seconds ago", () => {
    expect(
      isOrderable({
        ...orderable,
        lastSeenAt: new Date("2026-01-04T09:58:00.000Z"),
      }),
    ).toBe(true);
  });
});
