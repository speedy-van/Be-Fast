export type Minor = number;

export type DisplayMode = "OLD" | "NEW";

export interface OrderTotals {
  foodSubtotalMinor: Minor;
  discountMinor: Minor;
  deliveryFeeMinor: Minor;
  totalMinor: Minor;
  commissionMinor: Minor;
}

const basisPointsPerUnit = 10_000;
const minorPerNewLira = 100n;
const maxSafeMinor = BigInt(Number.MAX_SAFE_INTEGER);
const wholeNumber = new Intl.NumberFormat("en-US", {
  numberingSystem: "latn",
  maximumFractionDigits: 0,
});

function assertSafeMinor(amountMinor: Minor): void {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError("Amounts in minor units must be safe integers.");
  }
}

function toNonNegativeBigInt(amountMinor: Minor): bigint {
  assertSafeMinor(amountMinor);
  if (amountMinor < 0) {
    throw new RangeError("Prices and totals must be nonnegative.");
  }
  return BigInt(amountMinor);
}

function toMinor(amount: bigint): Minor {
  if (amount > maxSafeMinor) {
    throw new RangeError(
      "The calculated amount exceeds the safe integer range.",
    );
  }
  return Number(amount);
}

export function calcItemTotal(
  sizePriceMinor: Minor,
  optionPricesMinor: readonly Minor[],
  quantity: number,
): Minor {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
    throw new RangeError("Quantity must be an integer from 1 through 50.");
  }

  const unitPrice = optionPricesMinor.reduce(
    (sum, priceMinor) => sum + toNonNegativeBigInt(priceMinor),
    toNonNegativeBigInt(sizePriceMinor),
  );
  return toMinor(unitPrice * BigInt(quantity));
}

export function calcCommission(
  foodSubtotalMinor: Minor,
  commissionRateBps: number,
): Minor {
  if (
    !Number.isSafeInteger(commissionRateBps) ||
    commissionRateBps < 0 ||
    commissionRateBps > basisPointsPerUnit
  ) {
    throw new RangeError(
      "Commission must be an integer from 0 through 10000 basis points.",
    );
  }

  // The nonnegative operands make bigint division round down.
  const commission =
    (toNonNegativeBigInt(foodSubtotalMinor) * BigInt(commissionRateBps)) /
    BigInt(basisPointsPerUnit);
  return toMinor(commission);
}

export function calcOrderTotals(
  itemTotalsMinor: readonly Minor[],
  deliveryFeeMinor: Minor,
  commissionRateBps: number,
): OrderTotals {
  const foodSubtotal = itemTotalsMinor.reduce(
    (sum, itemTotalMinor) => sum + toNonNegativeBigInt(itemTotalMinor),
    0n,
  );
  const foodSubtotalMinor = toMinor(foodSubtotal);
  const totalMinor = toMinor(
    foodSubtotal + toNonNegativeBigInt(deliveryFeeMinor),
  );

  return {
    foodSubtotalMinor,
    discountMinor: 0,
    deliveryFeeMinor,
    totalMinor,
    commissionMinor: calcCommission(foodSubtotalMinor, commissionRateBps),
  };
}

export function formatMoney(
  amountMinor: Minor,
  displayMode: DisplayMode,
): string {
  assertSafeMinor(amountMinor);
  if (displayMode === "OLD") {
    return `${wholeNumber.format(BigInt(amountMinor))} ل.س`;
  }

  const sign = amountMinor < 0 ? "-" : "";
  const magnitude = BigInt(Math.abs(amountMinor));
  const liras = wholeNumber.format(magnitude / minorPerNewLira);
  const remainder = magnitude % minorPerNewLira;
  const fraction =
    remainder === 0n ? "" : `.${remainder.toString().padStart(2, "0")}`;
  return `${sign}${liras}${fraction} ل.س`;
}
