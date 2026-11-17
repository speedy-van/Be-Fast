import {
  createMenuItemSchema,
  createMenuOptionGroupSchema,
  createMenuOptionSchema,
  createMenuSectionSchema,
  createMenuSizeSchema,
  patchMenuItemSchema,
  patchMenuOptionGroupSchema,
  patchMenuOptionSchema,
  patchMenuSectionSchema,
  patchMenuSizeSchema,
  type RestaurantMenuGroup,
  type RestaurantMenuItem,
  type RestaurantMenuOption,
  type RestaurantMenuSection,
  type RestaurantMenuSize,
} from "@be-fast/contracts";
import type { DisplayMode, RestaurantRole } from "@be-fast/domain";
import {
  normalizeDigits,
  priceInput,
  priceMinorFromInput,
} from "./amount-input";

export const menuPath = "/restaurant/menu";

export type MenuTarget =
  | { kind: "section"; existing?: RestaurantMenuSection }
  | { kind: "item"; sectionId: string; existing?: RestaurantMenuItem }
  | { kind: "size"; itemId: string; existing?: RestaurantMenuSize }
  | { kind: "group"; itemId: string; existing?: RestaurantMenuGroup }
  | { kind: "option"; groupId: string; existing?: RestaurantMenuOption };

interface OptionInput {
  id: number;
  name: string;
  price: string;
}

export interface MenuDraft {
  name: string;
  description: string;
  sortOrder: string;
  sectionId: string;
  price: string;
  sizeName: string;
  availableFrom: string;
  availableTo: string;
  minSelect: string;
  maxSelect: string;
  options: OptionInput[];
}

export interface MenuSave {
  path: string;
  method: "POST" | "PATCH";
  body: unknown;
}

export function mayEditMenu(role: RestaurantRole) {
  return role === "OWNER" || role === "MANAGER";
}

function integer(input: string): number | undefined {
  const value = normalizeDigits(input.trim());
  if (!value) return undefined;
  return /^-?[0-9]+$/u.test(value) ? Number(value) : NaN;
}

export function initializeMenuDraft(
  target: MenuTarget,
  mode: DisplayMode,
): MenuDraft {
  const existing = target.existing;
  return {
    name: existing?.name ?? "",
    description:
      target.kind === "item" ? (target.existing?.description ?? "") : "",
    sortOrder: existing === undefined ? "" : String(existing.sortOrder),
    sectionId:
      target.kind === "item"
        ? (target.existing?.sectionId ?? target.sectionId)
        : "",
    price:
      (target.kind === "size" || target.kind === "option") && target.existing
        ? priceInput(target.existing.priceMinor, mode)
        : "",
    sizeName: "",
    availableFrom:
      target.kind === "item" ? (target.existing?.availableFrom ?? "") : "",
    availableTo:
      target.kind === "item" ? (target.existing?.availableTo ?? "") : "",
    minSelect:
      target.kind === "group" ? String(target.existing?.minSelect ?? 0) : "",
    maxSelect:
      target.kind === "group" ? String(target.existing?.maxSelect ?? 0) : "",
    options: [],
  };
}

export function prepareMenuSave(
  target: MenuTarget,
  draft: MenuDraft,
  mode: DisplayMode,
): MenuSave | null {
  const main = { name: draft.name, sortOrder: integer(draft.sortOrder) };
  const bodyWithPrice = {
    ...main,
    priceMinor: priceMinorFromInput(draft.price, mode),
  };
  switch (target.kind) {
    case "section": {
      if (target.existing) {
        const result = patchMenuSectionSchema.safeParse(main);
        return result.success
          ? {
              method: "PATCH",
              path: `${menuPath}/sections/${target.existing.id}`,
              body: result.data,
            }
          : null;
      }
      const result = createMenuSectionSchema.safeParse(main);
      return result.success
        ? { method: "POST", path: `${menuPath}/sections`, body: result.data }
        : null;
    }
    case "item": {
      const metadata = {
        ...main,
        sectionId: draft.sectionId,
        description: draft.description.trim() || null,
        availableFrom: normalizeDigits(draft.availableFrom.trim()) || null,
        availableTo: normalizeDigits(draft.availableTo.trim()) || null,
      };
      if (target.existing) {
        const result = patchMenuItemSchema.safeParse(metadata);
        return result.success
          ? {
              method: "PATCH",
              path: `${menuPath}/items/${target.existing.id}`,
              body: result.data,
            }
          : null;
      }
      const result = createMenuItemSchema.safeParse({
        ...metadata,
        sizes: [
          {
            name: draft.sizeName.trim() || undefined,
            priceMinor: bodyWithPrice.priceMinor,
          },
        ],
      });
      return result.success
        ? { method: "POST", path: `${menuPath}/items`, body: result.data }
        : null;
    }
    case "size": {
      if (bodyWithPrice.priceMinor === undefined) return null;
      if (target.existing) {
        const result = patchMenuSizeSchema.safeParse(bodyWithPrice);
        return result.success
          ? {
              method: "PATCH",
              path: `${menuPath}/sizes/${target.existing.id}`,
              body: result.data,
            }
          : null;
      }
      const result = createMenuSizeSchema.safeParse(bodyWithPrice);
      return result.success
        ? {
            method: "POST",
            path: `${menuPath}/items/${target.itemId}/sizes`,
            body: result.data,
          }
        : null;
    }
    case "group": {
      const minSelect = integer(draft.minSelect);
      const maxSelect = integer(draft.maxSelect);
      const optionCount = (target.existing?.options ?? draft.options).length;
      if (
        minSelect === undefined ||
        maxSelect === undefined ||
        minSelect > maxSelect ||
        maxSelect > optionCount
      )
        return null;
      const data = { ...main, minSelect, maxSelect };
      if (target.existing) {
        const result = patchMenuOptionGroupSchema.safeParse(data);
        return result.success
          ? {
              method: "PATCH",
              path: `${menuPath}/option-groups/${target.existing.id}`,
              body: result.data,
            }
          : null;
      }
      const result = createMenuOptionGroupSchema.safeParse({
        ...data,
        options: draft.options.map(({ name, price }) => ({
          name,
          priceMinor: priceMinorFromInput(price, mode),
        })),
      });
      return result.success
        ? {
            method: "POST",
            path: `${menuPath}/items/${target.itemId}/option-groups`,
            body: result.data,
          }
        : null;
    }
    case "option": {
      if (bodyWithPrice.priceMinor === undefined) return null;
      if (target.existing) {
        const result = patchMenuOptionSchema.safeParse(bodyWithPrice);
        return result.success
          ? {
              method: "PATCH",
              path: `${menuPath}/options/${target.existing.id}`,
              body: result.data,
            }
          : null;
      }
      const result = createMenuOptionSchema.safeParse(bodyWithPrice);
      return result.success
        ? {
            method: "POST",
            path: `${menuPath}/option-groups/${target.groupId}/options`,
            body: result.data,
          }
        : null;
    }
  }
}
