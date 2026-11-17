import {
  getOrderAvailability,
  isWithinDamascusTimeWindow,
  type DisplayMode,
  type Weekday,
} from "@be-fast/domain";
import type { Prisma } from "../generated/prisma/client.ts";

export function isItemAvailableAt(
  item: {
    isAvailable: boolean;
    availableFrom: string | null;
    availableTo: string | null;
  },
  now: Date,
) {
  return (
    item.isAvailable &&
    isWithinDamascusTimeWindow(item.availableFrom, item.availableTo, now)
  );
}

interface BrowseBranch {
  acceptingOrders: boolean;
  lastSeenAt: Date | null;
  openingPeriods: readonly {
    dayOfWeek: number;
    opensAt: string;
    closesAt: string;
  }[];
}

function isWeekday(day: number): day is Weekday {
  return Number.isInteger(day) && day >= 0 && day <= 6;
}

export function browseAvailability(
  branch: BrowseBranch,
  hasAvailableItem: boolean,
  now: Date,
) {
  const periods = branch.openingPeriods.flatMap(
    ({ dayOfWeek, opensAt, closesAt }) =>
      isWeekday(dayOfWeek) ? [{ dayOfWeek, opensAt, closesAt }] : [],
  );
  return getOrderAvailability({
    restaurantStatus: "APPROVED",
    orderType: "DELIVERY",
    acceptingOrders: branch.acceptingOrders,
    periods,
    instantUtc: now,
    lastSeenAt: branch.lastSeenAt,
    hasDeliveryZone: true,
    pickupEnabled: false,
    hasAvailableItem,
  });
}

export async function browseCurrencyMode(
  db: Prisma.TransactionClient,
): Promise<DisplayMode> {
  const setting = await db.platformSetting.findUnique({
    where: { key: "currency.displayMode" },
    select: { value: true },
  });
  return setting?.value === "NEW" ? "NEW" : "OLD";
}
