import { expect, it } from "vitest";
import { responseRemainingSeconds } from "./countdown";

it("bases the pending countdown on the server clock and monotonic elapsed time", () => {
  const reported = "2026-11-17T08:00:00.000Z";
  const expires = "2026-11-17T08:02:00.000Z";
  expect(responseRemainingSeconds(reported, expires, 0)).toBe(120);
  expect(responseRemainingSeconds(reported, expires, 1_001)).toBe(119);
  expect(responseRemainingSeconds(reported, expires, 120_100)).toBe(0);
});
