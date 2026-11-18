import { ApiClientError, type ResponseSchema } from "@be-fast/api-client";
import { customerAccountText as text, messages } from "@be-fast/i18n";
import { createElement, type ReactElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CustomerRequest, CustomerRequestOptions } from "../api";
import { Button, Field } from "../ui";
import { AccountScreen } from "./account-screen";
import { AddressScreen } from "./address-screen";

const fixture = vi.hoisted(() => ({
  alert: vi.fn(),
  permission: vi.fn(),
  location: vi.fn(),
  addBackListener: vi.fn<(
    event: "hardwareBackPress",
    handle: () => boolean,
  ) => { remove: () => void }>(() => ({ remove: vi.fn() })),
}));
vi.mock("react-native", () => ({
  Alert: { alert: fixture.alert },
  ActivityIndicator: "ActivityIndicator",
  BackHandler: { addEventListener: fixture.addBackListener },
  Modal: "Modal",
  Platform: { OS: "android" },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));
vi.mock("../catalog/region", () => ({ RegionPicker: () => null }));
vi.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: fixture.permission,
  getCurrentPositionAsync: fixture.location,
}));

const id = "5df2cfb8-0643-4101-a50a-cce13b7c16db";
const region = {
  governorateId: id,
  governorateName: "Fixture governorate",
  cityId: id,
  cityName: "Fixture city",
  neighborhoodId: id,
  neighborhoodName: "Fixture district",
};
let renderer: ReactTestRenderer | undefined;

async function mount(element: ReactElement) {
  await act(async () => {
    renderer = create(element);
  });
  if (!renderer) throw new Error("Expected component instance.");
  return renderer;
}

async function press(tree: ReactTestRenderer, label: string) {
  const button = tree.root
    .findAllByType(Button)
    .find((node) => node.props.label === label);
  const callback = button?.props.onPress as unknown;
  if (typeof callback !== "function")
    throw new Error("Expected interactive button.");
  await act(async () => {
    callback();
  });
}

async function enter(tree: ReactTestRenderer, label: string, value: string) {
  const field = tree.root
    .findAllByType(Field)
    .find((node) => node.props.label === label);
  const callback = field?.props.onChangeText as unknown;
  if (typeof callback !== "function") throw new Error("Expected text input.");
  await act(async () => {
    callback(value);
  });
}

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("keeps the local session on deletion rejection and clears it after confirmed success", async () => {
  const clear = vi.fn();
  const request = vi
    .fn()
    .mockRejectedValueOnce(
      new ApiClientError(409, messages.errors.activeOrders, "ACTIVE_ORDERS"),
    )
    .mockResolvedValueOnce(undefined);
  const tree = await mount(
    createElement(AccountScreen, {
      request: request as CustomerRequest,
      profile: { id, name: "Fixture customer", phone: null },
      onAddresses: vi.fn(),
      onSignOut: vi.fn(),
      onClearSession: clear,
    }),
  );

  async function confirm() {
    await press(tree, text.deleteAccount);
    const actions = fixture.alert.mock.lastCall?.[2] as
      { onPress?: () => void }[] | undefined;
    const action = actions?.[1]?.onPress;
    if (!action) throw new Error("Expected irreversible action confirmation.");
    await act(async () => action());
  }

  await confirm();
  expect(clear).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain(messages.errors.activeOrders);
  await confirm();
  expect(request.mock.calls).toEqual([
    ["/customer/me", { method: "DELETE" }],
    ["/customer/me", { method: "DELETE" }],
  ]);
  expect(clear).toHaveBeenCalledTimes(1);
});

it("requests GPS only on explicit action and sends coordinates only after permission", async () => {
  fixture.permission
    .mockResolvedValueOnce({ granted: false })
    .mockResolvedValueOnce({ granted: true });
  fixture.location.mockResolvedValue({
    coords: { latitude: 33.5, longitude: 36.3 },
  });
  const request = vi.fn(
    async (
      _path: string,
      options?: CustomerRequestOptions,
      schema?: ResponseSchema<unknown>,
    ) => {
      const value =
        options?.method === "POST"
          ? { ...(options.body as object), id, isDefault: true }
          : [];
      return schema?.parse(value) ?? value;
    },
  );
  const tree = await mount(
    <AddressScreen
      request={request as CustomerRequest}
      region={region}
      addresses={[]}
      onUpdateAddresses={vi.fn()}
      onSelect={vi.fn()}
      onBack={vi.fn()}
    />,
  );
  await press(tree, text.addAddress);
  expect(fixture.permission).not.toHaveBeenCalled();
  await press(tree, text.useLocation);
  expect(fixture.permission).toHaveBeenCalledTimes(1);
  expect(fixture.location).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain(text.locationDenied);
  await press(tree, text.useLocation);
  expect(fixture.location).toHaveBeenCalledTimes(1);
  await enter(tree, text.street, "Fixture street");
  await enter(tree, text.landmark, "Fixture landmark");
  await press(tree, text.save);
  expect(request).toHaveBeenCalledWith(
    "/customer/addresses",
    {
      method: "POST",
      body: expect.objectContaining({ latitude: 33.5, longitude: 36.3 }),
    },
    expect.anything(),
  );
});

it("closes the editor before Android Back leaves the address list", async () => {
  const leave = vi.fn();
  const tree = await mount(
    <AddressScreen
      request={vi.fn().mockResolvedValue([]) as CustomerRequest}
      region={region}
      addresses={[]}
      onUpdateAddresses={vi.fn()}
      onSelect={vi.fn()}
      onBack={leave}
    />,
  );
  async function pressAndroidBack() {
    const handle = fixture.addBackListener.mock.lastCall?.[1];
    if (!handle) throw new Error("Android Back listener is missing.");
    await act(async () => expect(handle()).toBe(true));
  }
  await press(tree, text.addAddress);
  await pressAndroidBack();
  expect(leave).not.toHaveBeenCalled();
  await press(tree, text.addAddress);
  await pressAndroidBack();
  await pressAndroidBack();
  expect(leave).toHaveBeenCalledOnce();
});
