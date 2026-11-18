import { describe, expect, it, vi } from "vitest";
import {
  calcCommission,
  calcItemTotal,
  calcOrderTotals,
  formatMoney,
  type DisplayMode,
} from "../src/money.js";

describe("order money", () => {
  it("calculates the specification example from line totals", () => {
    const first = calcItemTotal(35_000, [4_000, 1_000], 1);
    const second = calcItemTotal(18_000, [2_000], 2);
    expect(first).toBe(40_000);
    expect(second).toBe(40_000);
    expect(calcOrderTotals([first, second], 10_000, 1_000)).toEqual({
      foodSubtotalMinor: 80_000,
      discountMinor: 0,
      deliveryFeeMinor: 10_000,
      totalMinor: 90_000,
      commissionMinor: 8_000,
    });
  });

  it("rounds commission down in minor units", () => {
    expect(calcCommission(33_333, 1_000)).toBe(3_333);
    expect(calcCommission(9, 1_000)).toBe(0);
  });

  it("preserves precision for the full safe integer range", () => {
    const maxMinor = Number.MAX_SAFE_INTEGER;
    expect(calcItemTotal(maxMinor, [0], 1)).toBe(maxMinor);
    expect(calcCommission(maxMinor, 0)).toBe(0);
    expect(calcCommission(maxMinor, 10_000)).toBe(maxMinor);
    expect(calcCommission(maxMinor, 9_999)).toBe(9_006_298_534_815_516);
    expect(() => calcItemTotal(maxMinor, [], 2)).toThrow(RangeError);
    expect(() => calcOrderTotals([maxMinor, 1], 0, 0)).toThrow(RangeError);
    expect(() => calcOrderTotals([maxMinor], 1, 0)).toThrow(RangeError);
  });

  it("supports quantity 50, zero prices, and zero delivery fees", () => {
    expect(calcItemTotal(5, [], 50)).toBe(250);
    expect(calcItemTotal(0, [0], 1)).toBe(0);
    expect(calcOrderTotals([10], 0, 10_000)).toEqual({
      foodSubtotalMinor: 10,
      discountMinor: 0,
      deliveryFeeMinor: 0,
      totalMinor: 10,
      commissionMinor: 10,
    });
  });

  it.each([0, 51, 1.5, NaN])("rejects invalid quantity %s", (quantity) => {
    expect(() => calcItemTotal(10, [], quantity)).toThrow(RangeError);
  });

  it.each([-1, 1.5, 10_001, Infinity])(
    "rejects invalid commission rate %s",
    (rate) => {
      expect(() => calcCommission(10, rate)).toThrow(RangeError);
    },
  );

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid order amounts %s",
    (amount) => {
      expect(() => calcItemTotal(amount, [], 1)).toThrow(RangeError);
      expect(() => calcItemTotal(10, [amount], 1)).toThrow(RangeError);
      expect(() => calcOrderTotals([amount], 0, 0)).toThrow(RangeError);
      expect(() => calcOrderTotals([10], amount, 0)).toThrow(RangeError);
      expect(() => calcCommission(amount, 0)).toThrow(RangeError);
    },
  );
});

describe("formatMoney", () => {
  const examples: [number, DisplayMode, string][] = [
    [80_000, "OLD", "80,000 ل.س"],
    [80_000, "NEW", "800 ل.س"],
    [80_050, "NEW", "800.50 ل.س"],
    [100_001, "NEW", "1,000.01 ل.س"],
    [0, "NEW", "0 ل.س"],
    [-0, "OLD", "0 ل.س"],
    [-80_000, "OLD", "-80,000 ل.س"],
    [-50, "NEW", "-0.50 ل.س"],
    [Number.MAX_SAFE_INTEGER, "NEW", "90,071,992,547,409.91 ل.س"],
  ];

  it.each(examples)("formats %s in %s mode as %s", (amount, mode, expected) => {
    expect(formatMoney(amount, mode)).toBe(expected);
  });

  it("formats both currency modes on an Intl runtime that rejects BigInt", () => {
    const format = new Intl.NumberFormat("en-US").format;
    const numberOnly = vi
      .spyOn(Intl.NumberFormat.prototype, "format", "get")
      .mockReturnValue((value) => {
        if (typeof value !== "number") throw new TypeError("Expected a number");
        return format(value);
      });
    try {
      expect(formatMoney(Number.MAX_SAFE_INTEGER, "OLD")).toBe(
        "9,007,199,254,740,991 ل.س",
      );
      expect(formatMoney(-Number.MAX_SAFE_INTEGER, "NEW")).toBe(
        "-90,071,992,547,409.91 ل.س",
      );
    } finally {
      numberOnly.mockRestore();
    }
  });

  it.each([1.5, -1.5, Infinity, Number.MIN_SAFE_INTEGER - 1])(
    "rejects invalid amounts %s",
    (amount) => {
      expect(() => formatMoney(amount, "OLD")).toThrow(RangeError);
      expect(() => formatMoney(amount, "NEW")).toThrow(RangeError);
    },
  );
});
