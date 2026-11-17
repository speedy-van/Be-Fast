import type { ResponseSchema } from "@be-fast/api-client";
import { restaurantApp as text } from "@be-fast/i18n";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { expect, it, vi } from "vitest";
import type { RequestOptions } from "./api";
import { BranchControls } from "./branch-controls";
import { Button, Field } from "./ui";

const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./session", () => ({
  useRestaurantSession: () => ({
    restaurantId: "fixture",
    role: "OWNER",
    currencyDisplayMode: "NEW",
    request: mock.request,
  }),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: <T,>(styles: T) => styles },
  Switch: "Switch",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));

const settingsPath = "/restaurant/branch/settings";
const zonesPath = "/restaurant/branch/delivery-zones";
const neighborhoodId = "00000000-0000-4000-8000-000000000001";
const zoneId = "00000000-0000-4000-8000-000000000002";

function field(tree: ReactTestRenderer, label: string) {
  const control = tree.root
    .findAllByType(Field)
    .find((node) => node.props.label === label);
  if (!control) throw new Error("Expected branch field.");
  return control;
}

function pressInSection(control: ReactTestInstance, label: string) {
  const button = control.parent
    ?.findAllByType(Button)
    .find((node) => node.props.label === label);
  const onPress = button?.props.onPress as unknown;
  if (typeof onPress !== "function") throw new Error("Expected branch action.");
  onPress();
}

function enter(control: ReactTestInstance, value: string) {
  const onChangeText = control.props.onChangeText as unknown;
  if (typeof onChangeText !== "function")
    throw new Error("Expected input binding.");
  onChangeText(value);
}

it("round-trips editable NEW-currency branch amounts without changing their unit", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mock.request.mockImplementation(
    async (
      path: string,
      options?: RequestOptions,
      schema?: ResponseSchema<unknown>,
    ) => {
      let response: unknown = { periods: [] };
      if (path === settingsPath)
        response = options?.body ?? {
          minOrderMinor: 80_050,
          pickupEnabled: true,
        };
      if (path === zonesPath) {
        const stored = { neighborhoodId, etaMinutes: 25, feeMinor: 12_050 };
        const write = options?.body as { zones: (typeof stored)[] } | undefined;
        response = {
          zones: (write?.zones ?? [stored]).map((zone) => ({
            id: zoneId,
            ...zone,
          })),
        };
      }
      return schema?.parse(response) ?? response;
    },
  );
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(
        <BranchControls
          geo={{
            data: undefined,
            loading: false,
            error: undefined,
            reload: () => undefined,
            setData: () => undefined,
          }}
        />,
      );
    });
    if (!renderer) throw new Error("Expected branch controls.");
    const minimum = field(renderer, text.minimum);
    const fee = field(renderer, text.fee);
    expect(minimum.props.value).toBe("800.50");
    await act(async () => pressInSection(fee, text.edit));
    expect(fee.props.value).toBe("120.50");
    await act(async () => enter(fee, "2,510.05"));
    await act(async () => pressInSection(fee, text.save));
    expect(mock.request).toHaveBeenCalledWith(
      zonesPath,
      {
        method: "PUT",
        body: {
          zones: [{ neighborhoodId, feeMinor: 251_005, etaMinutes: 25 }],
        },
      },
      expect.anything(),
    );
    await act(async () => enter(minimum, "325.05"));
    await act(async () => pressInSection(minimum, text.save));
    expect(mock.request).toHaveBeenCalledWith(
      settingsPath,
      { method: "PATCH", body: { minOrderMinor: 32_505, pickupEnabled: true } },
      expect.anything(),
    );
  } finally {
    await act(async () => renderer?.unmount());
    vi.unstubAllGlobals();
  }
});
