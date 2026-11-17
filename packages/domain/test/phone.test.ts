import { describe, expect, it } from "vitest";
import { maskPhone, normalizeSyrianPhone } from "../src/phone.js";

describe("Syrian mobile phones", () => {
  it.each(["0912345612", "912345612", "+963912345612", "00963912345612"])(
    "normalizes and masks %s",
    (input) => {
      expect(normalizeSyrianPhone(input)).toBe("+963912345612");
      expect(maskPhone(input)).toBe("+9639••••••12");
    },
  );

  it.each([
    "",
    "0112345678",
    "91234561",
    "09123456123",
    "963912345612",
    "00964912345612",
    " 912345612",
    "912345612\n",
    "+963-912345612",
    "09123456١٢",
  ])("rejects unsupported input %j", (input) => {
    expect(normalizeSyrianPhone(input)).toBeNull();
    expect(maskPhone(input)).toBeNull();
  });
});
