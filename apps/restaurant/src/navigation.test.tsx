import { ApiClientError } from "@be-fast/api-client";
import { restaurantApp as text } from "@be-fast/i18n";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vitest";
import HomeScreen from "../app/index";
import { LoginScreen } from "./login";

const fixtures = vi.hoisted(() => ({
  listeners: new Set<() => boolean>(),
  restaurantStatus: "APPROVED",
  sendRestaurantRequest: vi.fn(),
}));

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  View: "View",
  StyleSheet: { create: <T,>(styles: T) => styles },
  BackHandler: {
    addEventListener: (_type: "hardwareBackPress", listener: () => boolean) => {
      fixtures.listeners.add(listener);
      return { remove: () => fixtures.listeners.delete(listener) };
    },
  },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("./api", () => ({ sendRestaurantRequest: fixtures.sendRestaurantRequest }));
vi.mock("./branch-controls", () => ({ BranchControls: () => null }));
vi.mock("./menu/menu-screen", () => ({ MenuScreen: () => null }));
vi.mock("./onboarding", () => ({ OnboardingScreen: () => null }));
vi.mock("./orders", () => ({ RestaurantOrders: () => null }));
vi.mock("./owner-controls", () => ({
  ReportsScreen: () => null,
  StaffControls: () => null,
}));
vi.mock("./region", () => ({ useRestaurantGeo: () => null }));
vi.mock("./session", () => ({
  useRestaurantAuth: () => ({
    state: { phase: "ready", credentials: { restaurantId: "restaurant" } },
  }),
  useRestaurantSession: () => ({
    role: "OWNER",
    restaurantStatus: fixtures.restaurantStatus,
  }),
}));
vi.mock("./ui", () => ({
  AppText: "Text",
  nativeFont: { bold: "test-bold" },
  styles: { body: { flex: 1 }, flex: { flex: 1 } },
  Button: "TestButton",
  Field: "TestField",
  ScrollScreen: "ScrollScreen",
  Status: () => null,
}));

it.each([
  ["APPROVED", text.orders],
  ["PENDING_REVIEW", text.onboarding],
])("returns an %s owner from Menu to their starting section", async (status, start) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixtures.restaurantStatus = status;
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(<HomeScreen />);
    });
    if (!renderer) throw new Error("Restaurant app was not mounted.");
    const tab = (label: string) =>
      renderer?.root.find(
        ({ type, props }) =>
          typeof type === "string" &&
          props.accessibilityRole === "tab" &&
          props.accessibilityLabel === label,
      );
    expect(tab(start)?.props.accessibilityState.selected).toBe(true);
    const pressMenu = tab(text.menu)?.props.onPress as unknown;
    if (typeof pressMenu !== "function") throw new Error("Menu tab is unavailable.");
    await act(async () => pressMenu());
    expect(tab(text.menu)?.props.accessibilityState.selected).toBe(true);
    await act(async () => {
      expect(Array.from(fixtures.listeners).some((listener) => listener())).toBe(true);
    });
    expect(tab(start)?.props.accessibilityState.selected).toBe(true);
    expect(fixtures.listeners.size).toBe(0);
  } finally {
    await act(async () => renderer?.unmount());
    vi.unstubAllGlobals();
  }
});

it("handles Android Back from both alternate sign-in forms without leaving during an OTP request", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let renderer: ReactTestRenderer | undefined;
  let finishOtp: (() => void) | undefined;
  const otpResponse = new Promise<void>((resolve) => {
    finishOtp = resolve;
  });
  fixtures.sendRestaurantRequest.mockReturnValueOnce(otpResponse);
  try {
    await act(async () => {
      renderer = create(<LoginScreen />);
    });
    const field = (label: string) =>
      renderer?.root.findAll(
        ({ type, props }) =>
          typeof type === "string" &&
          props.label === label &&
          typeof props.onChangeText === "function",
      )[0];
    async function enter(label: string, value: string) {
      const change = field(label)?.props.onChangeText as unknown;
      if (typeof change !== "function") throw new Error(`Missing field: ${label}`);
      await act(async () => change(value));
    }
    async function press(label: string) {
      const action = renderer?.root.find(
        ({ type, props }) =>
          typeof type === "string" &&
          props.label === label &&
          typeof props.onPress === "function",
      ).props.onPress as unknown;
      if (typeof action !== "function") throw new Error(`Missing button: ${label}`);
      await act(async () => action());
    }
    async function nativeBack() {
      await act(async () => {
        expect(Array.from(fixtures.listeners).some((listener) => listener())).toBe(true);
      });
    }

    expect(fixtures.listeners.size).toBe(0);
    await press(text.register);
    await enter(text.phone, "0912345678");
    await press(text.sendCode);
    await nativeBack();
    expect(fixtures.listeners.size).toBe(1);
    await act(async () => finishOtp?.());
    expect(field(text.otp)).toBeDefined();
    await nativeBack();
    expect(field(text.otp)).toBeUndefined();
    expect(fixtures.listeners.size).toBe(0);

    await enter(text.password, "temporary-password");
    fixtures.sendRestaurantRequest.mockRejectedValueOnce(
      new ApiClientError(409, undefined, "PASSWORD_CHANGE_REQUIRED"),
    );
    await press(text.login);
    expect(field(text.newPassword)).toBeDefined();
    await nativeBack();
    expect(field(text.newPassword)).toBeUndefined();
    expect(field(text.password)?.props.value).toBe("");
    expect(fixtures.listeners.size).toBe(0);
  } finally {
    await act(async () => renderer?.unmount());
    vi.unstubAllGlobals();
    fixtures.sendRestaurantRequest.mockReset();
  }
});
