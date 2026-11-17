import { describe, expect, it } from "vitest";
import { isOpenAt, type OpeningPeriod } from "../src/hours.js";

describe("isOpenAt in Asia/Damascus", () => {
  const overnight: OpeningPeriod = {
    dayOfWeek: 6,
    opensAt: "18:00",
    closesAt: "02:00",
  };

  it.each([
    ["2026-01-03T14:59:00Z", false],
    ["2026-01-03T15:00:00Z", true],
    ["2026-01-03T21:00:00Z", true],
    ["2026-01-03T22:30:00Z", true],
    ["2026-01-03T23:00:00Z", false],
    ["2026-01-04T22:30:00Z", false],
  ])(
    "checks the local day and exclusive closing time at %s",
    (instant, expected) => {
      expect(isOpenAt([overnight], new Date(instant))).toBe(expected);
    },
  );

  it("closes on a day without a matching period", () => {
    const instant = new Date("2026-01-04T10:00:00Z");
    expect(isOpenAt([], instant)).toBe(false);
    expect(
      isOpenAt(
        [{ dayOfWeek: 6, opensAt: "09:00", closesAt: "18:00" }],
        instant,
      ),
    ).toBe(false);
  });

  it.each([
    ["2026-01-04T05:59:00Z", false],
    ["2026-01-04T06:00:00Z", true],
    ["2026-01-04T09:00:00Z", false],
    ["2026-01-04T13:00:00Z", true],
    ["2026-01-04T15:01:00Z", false],
  ])("checks separate shifts on the same day at %s", (instant, expected) => {
    expect(
      isOpenAt(
        [
          { dayOfWeek: 0, opensAt: "09:00", closesAt: "12:00" },
          { dayOfWeek: 0, opensAt: "15:00", closesAt: "18:00" },
        ],
        new Date(instant),
      ),
    ).toBe(expected);
  });

  it("carries equal opening and closing times to the next day", () => {
    const period: OpeningPeriod = {
      dayOfWeek: 0,
      opensAt: "18:00",
      closesAt: "18:00",
    };
    expect(isOpenAt([period], new Date("2026-01-05T14:59:00Z"))).toBe(true);
    expect(isOpenAt([period], new Date("2026-01-05T15:00:00Z"))).toBe(false);
  });
});
