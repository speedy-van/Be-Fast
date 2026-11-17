import { describe, expect, it } from "vitest";
import {
  hasValidOptionBounds,
  type MenuOptionGroup,
  validateMenuOptions,
} from "../src/menu-validation.js";

describe("menu option groups", () => {
  it.each([
    [0, 0, 0, true],
    [0, 2, 2, true],
    [1, 1, 2, true],
    [-1, 1, 2, false],
    [2, 1, 2, false],
    [2, 2, 1, false],
    [0, 2, 1, false],
    [0.5, 1, 1, false],
    [0, 0.5, 1, false],
    [0, 1, 1.5, false],
  ])("validates min=%i max=%i for %i options", (min, max, count, expected) => {
    expect(hasValidOptionBounds(min, max, count)).toBe(expected);
  });

  const group: MenuOptionGroup = {
    minSelect: 1,
    maxSelect: 1,
    options: [
      { id: "sauce-a", isAvailable: true },
      { id: "sauce-b", isAvailable: true },
      { id: "sauce-c", isAvailable: false },
    ],
  };
  const optionalGroup: MenuOptionGroup = {
    minSelect: 0,
    maxSelect: 2,
    options: [
      { id: "without-onion", isAvailable: true },
      { id: "without-pickles", isAvailable: true },
    ],
  };

  it.each([
    [["sauce-a"], true],
    [["sauce-b", "without-onion", "without-pickles"], true],
    [["without-onion"], false],
    [["sauce-a", "sauce-b"], false],
    [["sauce-a", "sauce-a"], false],
    [["sauce-a", "unknown"], false],
    [["sauce-c"], false],
  ])("validates selection %j", (selected, expected) => {
    expect(validateMenuOptions([group, optionalGroup], selected)).toBe(
      expected,
    );
  });

  it("rejects an invalid group configuration before evaluating the selection", () => {
    expect(validateMenuOptions([{ ...group, maxSelect: 4 }], ["sauce-a"])).toBe(
      false,
    );
  });

  it("allows an empty selection for an item without groups", () => {
    expect(validateMenuOptions([], [])).toBe(true);
    expect(validateMenuOptions([], ["sauce-a"])).toBe(false);
  });
});
