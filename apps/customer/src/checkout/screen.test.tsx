import { ApiClientError, type ResponseSchema } from "@be-fast/api-client";
import { formatMoney } from "@be-fast/domain";
import { customerApp as text } from "@be-fast/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ComponentProps } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CustomerRequestOptions } from "../api";
import type { Cart, Region } from "../catalog/types";
import type { CheckoutAttempt } from "../store";
import { AppText, Button } from "../ui";
import { CheckoutScreen } from "./screen";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  TextInput: "TextInput",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: <T,>(styles: T) => styles },
}));

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const region: Region = {
  governorateId: id(1),
  governorateName: "Governorate",
  cityId: id(2),
  cityName: "City",
  neighborhoodId: id(3),
  neighborhoodName: "Neighborhood",
};
const cart: Cart = {
  restaurantId: id(4),
  branchId: id(5),
  restaurantName: "Restaurant",
  pickupEnabled: true,
  deliveryFeeMinor: 2500,
  minOrderMinor: 0,
  etaMinutes: 25,
  currencyDisplayMode: "OLD",
  items: [
    {
      key: "line",
      menuItemId: id(6),
      sizeId: id(7),
      optionIds: [],
      quantity: 1,
      name: "Meal",
      sizeName: "Regular",
      optionNames: [],
      sizePriceMinor: 11_500,
      optionPricesMinor: [],
    },
  ],
};
const address = {
  id: id(8),
  neighborhoodId: region.neighborhoodId,
  label: null,
  street: "Street",
};
const profile = { id: id(9), phone: "+963912345678", name: "Customer" };
type CheckoutProps = ComponentProps<typeof CheckoutScreen>;

function createRequest(
  handler: (path: string, options?: CustomerRequestOptions) => Promise<unknown>,
) {
  function request<T>(
    path: string,
    options: CustomerRequestOptions | undefined,
    schema: ResponseSchema<T>,
  ): Promise<T>;
  function request(
    path: string,
    options?: CustomerRequestOptions,
  ): Promise<unknown>;
  async function request<T>(
    path: string,
    options?: CustomerRequestOptions,
    schema?: ResponseSchema<T>,
  ) {
    const value = await handler(path, options);
    return schema ? schema.parse(value) : value;
  }
  return request;
}

const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
let renderer: ReactTestRenderer | undefined;
const testing = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
beforeEach(() => {
  testing.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => {
    renderer?.unmount();
  });
  renderer = undefined;
  client.clear();
  delete testing.IS_REACT_ACT_ENVIRONMENT;
});

async function mount(
  request: CheckoutProps["request"],
  props: Partial<CheckoutProps> = {},
) {
  const onCreated = vi.fn();
  const onOrders = vi.fn();
  const publicRequest =
    props.publicRequest ??
    createRequest(async () => {
      throw new TypeError("Offline");
    });
  function TestScreen() {
    const [attempt, setAttempt] = useState<CheckoutAttempt>({
      key: id(10),
      uncertain: false,
    });
    return (
      <CheckoutScreen
        cart={cart}
        region={region}
        address={address}
        profile={profile}
        publicRequest={publicRequest}
        request={request}
        attempt={attempt}
        signIn={vi.fn()}
        onProfile={vi.fn()}
        onAttempt={async (value) => {
          setAttempt(value);
        }}
        onAddresses={vi.fn()}
        onOrders={onOrders}
        onCreated={onCreated}
        onBack={vi.fn()}
        {...props}
      />
    );
  }
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={client}>
        <TestScreen />
      </QueryClientProvider>,
    );
  });
  if (!renderer) throw new Error("Checkout did not mount.");
  return { root: renderer.root, onCreated, onOrders };
}

it("keeps the request key while offline, prevents a double tap, and offers order history without success", async () => {
  const send = vi
    .fn<(path: string, options?: CustomerRequestOptions) => Promise<unknown>>()
    .mockRejectedValue(new TypeError("Offline"));
  const { root, onCreated, onOrders } = await mount(createRequest(send));
  const confirm = root
    .findAllByType(Button)
    .find((button) => button.props.testID === "checkout-confirm");
  if (!confirm) throw new Error("Confirmation button is missing.");
  await act(async () => {
    confirm.props.onPress();
    confirm.props.onPress();
  });
  expect(send).toHaveBeenCalledTimes(4);
  for (const [path, options] of send.mock.calls) {
    expect(path).toBe("/customer/orders");
    expect(options?.headers).toEqual({ "Idempotency-Key": id(10) });
    expect(options?.body).toEqual(send.mock.calls[0]?.[1]?.body);
  }
  expect(onCreated).not.toHaveBeenCalled();
  expect(
    root
      .findAllByType(AppText)
      .some(({ props }) => props.children === text.uncertain),
  ).toBe(true);
  const viewOrders = root
    .findAllByType(Button)
    .find((button) => button.props.label === text.checkOrders);
  if (!viewOrders) throw new Error("Order history button is missing.");
  await act(async () => {
    viewOrders.props.onPress();
  });
  expect(onOrders).toHaveBeenCalledOnce();
  await act(async () => {
    confirm.props.onPress();
  });
  expect(send).toHaveBeenCalledTimes(8);
  expect(send.mock.calls[7]?.[1]?.headers).toEqual({
    "Idempotency-Key": id(10),
  });
});

it("displays the server's revised total and waits for another tap before creating an order", async () => {
  const send = vi
    .fn<(_path: string, options?: CustomerRequestOptions) => Promise<unknown>>()
    .mockRejectedValueOnce(
      new ApiClientError(409, undefined, "PRICE_CHANGED", {
        foodSubtotalMinor: 12_750,
        deliveryFeeMinor: 3_000,
        discountMinor: 0,
        totalMinor: 15_750,
        items: [
          {
            menuItemId: id(6),
            sizeId: id(7),
            optionIds: [],
            quantity: 1,
            unitPriceMinor: 12_750,
            totalMinor: 12_750,
          },
        ],
      }),
    )
    .mockResolvedValueOnce({ id: id(11) });
  const { root, onCreated } = await mount(createRequest(send));
  const confirm = () => {
    const button = root
      .findAllByType(Button)
      .find((node) => node.props.testID === "checkout-confirm");
    if (!button) throw new Error("Confirmation button is missing.");
    return button;
  };
  await act(async () => {
    confirm().props.onPress();
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(onCreated).not.toHaveBeenCalled();
  expect(
    root
      .findAllByType(AppText)
      .find((node) => node.props.testID === "checkout-total")?.props.children,
  ).toContain(formatMoney(15_750, "OLD"));
  expect(confirm().props.label).toBe(text.confirmPrice);
  await act(async () => {
    confirm().props.onPress();
  });
  expect(send.mock.calls[1]?.[1]).toMatchObject({
    headers: { "Idempotency-Key": id(10) },
    body: { expectedTotalMinor: 15_750 },
  });
  expect(onCreated).toHaveBeenCalledExactlyOnceWith(id(11));
});

it("does not request OTP while rendering anonymous checkout", async () => {
  const publicCall = vi.fn(async (path: string) => {
    if (path === "/auth/customer/otp/request") return undefined;
    throw new TypeError("Offline");
  });
  const { root } = await mount(createRequest(vi.fn()), {
    profile: null,
    publicRequest: createRequest(publicCall),
  });
  expect(publicCall.mock.calls.some(([path]) => path.startsWith("/auth"))).toBe(
    false,
  );
  const confirm = root
    .findAllByType(Button)
    .find((button) => button.props.testID === "checkout-confirm");
  if (!confirm) throw new Error("Confirmation button is missing.");
  await act(async () => {
    confirm.props.onPress();
  });
  expect(
    root
      .findAllByType(Button)
      .some(({ props }) => props.label === text.sendCode),
  ).toBe(true);
  expect(publicCall.mock.calls.some(([path]) => path.startsWith("/auth"))).toBe(
    false,
  );
});
