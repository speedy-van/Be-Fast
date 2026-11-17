import { describe, expect, it } from "vitest";
import {
  initializeMenuDraft,
  mayEditMenu,
  prepareMenuSave,
  priceMinorFromInput,
  type MenuTarget,
} from "./menu-model";

const sectionId = "00000000-0000-4000-8000-000000000001";
const itemId = "00000000-0000-4000-8000-000000000002";
const sizeId = "00000000-0000-4000-8000-000000000003";

describe("restaurant menu edits", () => {
  it("reserves full editing for owners and managers", () => {
    expect(mayEditMenu("OWNER")).toBe(true);
    expect(mayEditMenu("MANAGER")).toBe(true);
    expect(mayEditMenu("CASHIER")).toBe(false);
    expect(mayEditMenu("KITCHEN")).toBe(false);
  });

  it("converts both display modes to integer minor units without rounding", () => {
    expect(priceMinorFromInput("80,050", "OLD")).toBe(80_050);
    expect(priceMinorFromInput("80.50", "OLD")).toBeUndefined();
    expect(priceMinorFromInput("\u0668\u0660\u0660\u066b\u0665", "NEW")).toBe(
      80_050,
    );
    expect(priceMinorFromInput("800.50", "NEW")).toBe(80_050);
    expect(priceMinorFromInput("800.501", "NEW")).toBeUndefined();
    expect(priceMinorFromInput("90,071,992,547,409.91", "NEW")).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(priceMinorFromInput("90,071,992,547,409.92", "NEW")).toBeUndefined();
    expect(priceMinorFromInput("-2", "OLD")).toBeUndefined();
    expect(priceMinorFromInput("80,50", "OLD")).toBeUndefined();
  });

  it("requires a size at item creation and leaves the default name to the API", () => {
    const target = { kind: "item", sectionId } as const;
    const draft = {
      ...initializeMenuDraft(target, "NEW"),
      name: "Fixture item",
    };
    expect(prepareMenuSave(target, draft, "NEW")).toBeNull();
    expect(
      prepareMenuSave(
        target,
        { ...draft, price: "78.90", availableFrom: "09:00" },
        "NEW",
      ),
    ).toMatchObject({
      method: "POST",
      path: "/restaurant/menu/items",
      body: {
        sectionId,
        sizes: [{ priceMinor: 7_890 }],
        availableFrom: "09:00",
      },
    });
  });

  it("keeps the exact stored amount when an existing size is opened and saved", () => {
    const target: MenuTarget = {
      kind: "size",
      itemId,
      existing: {
        id: sizeId,
        menuItemId: itemId,
        name: "Fixture size",
        sortOrder: 1,
        priceMinor: 80_050,
      },
    };
    const draft = initializeMenuDraft(target, "NEW");
    expect(draft.price).toBe("800.50");
    expect(prepareMenuSave(target, draft, "NEW")).toMatchObject({
      method: "PATCH",
      path: `/restaurant/menu/sizes/${sizeId}`,
      body: { priceMinor: 80_050, sortOrder: 1 },
    });
  });

  it("validates the selection range and includes the initial group options in one mutation", () => {
    const target = { kind: "group", itemId } as const;
    const draft = {
      ...initializeMenuDraft(target, "NEW"),
      name: "Fixture group",
      minSelect: "1",
      maxSelect: "2",
      options: [{ id: 1, name: "Fixture option", price: "1.25" }],
    };
    expect(prepareMenuSave(target, draft, "NEW")).toBeNull();
    expect(
      prepareMenuSave(target, { ...draft, maxSelect: "1" }, "NEW"),
    ).toMatchObject({
      method: "POST",
      path: `/restaurant/menu/items/${itemId}/option-groups`,
      body: {
        minSelect: 1,
        maxSelect: 1,
        options: [{ name: "Fixture option", priceMinor: 125 }],
      },
    });
  });
});
