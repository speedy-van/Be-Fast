import type { ResponseSchema } from "@be-fast/api-client";
import type { OrderReadResponse } from "@be-fast/contracts";
import {
  ORDER_STATUSES,
  ORDER_TYPES,
  RESTAURANT_ROLES,
  allowedTransitions,
} from "@be-fast/domain";
import { restaurantOrders as text } from "@be-fast/i18n";
import { createElement, type ReactElement, type ReactNode } from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RequestOptions } from "../api";
import { Choices } from "../ui";
import { OrderConsole } from "./console";
import { OrderDetail, responseCountdown } from "./view";

vi.mock("react-native", async () => {
  const { createElement, Fragment } =
    await vi.importActual<typeof import("react")>("react");
  return {
    View: "View",
    Text: "Text",
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    Switch: "Switch",
    TextInput: "TextInput",
    ActivityIndicator: "ActivityIndicator",
    Linking: { openURL: vi.fn() },
    StyleSheet: { create: <T,>(styles: T) => styles },
    FlatList: ({
      data,
      keyExtractor,
      renderItem,
      ListHeaderComponent,
      ListEmptyComponent,
    }: {
      data: readonly unknown[];
      keyExtractor: (item: unknown, index: number) => string;
      renderItem: (args: { item: unknown; index: number }) => ReactNode;
      ListHeaderComponent?: ReactNode;
      ListEmptyComponent?: ReactNode;
    }) =>
      createElement(
        "FlatList",
        null,
        ListHeaderComponent,
        data.length === 0
          ? ListEmptyComponent
          : data.map((item, index) =>
              createElement(
                Fragment,
                { key: keyExtractor(item, index) },
                renderItem({ item, index }),
              ),
            ),
      ),
  };
});

const createdAt = "2026-11-17T16:00:00.000Z";
const pending: OrderReadResponse = {
  id: "4aca0950-a15f-49ec-9148-28c3a02391bc",
  branchId: "4aca0950-a15f-49ec-9148-28c3a02391bd",
  restaurantId: "4aca0950-a15f-49ec-9148-28c3a02391be",
  restaurantName: "Fixture restaurant",
  orderNumber: "BF-100001",
  type: "DELIVERY",
  status: "PENDING",
  customerName: "Fixture customer",
  customerPhone: "+963912345678",
  addressSnapshot: { street: "Fixture street" },
  totalMinor: 45_000,
  foodSubtotalMinor: 40_000,
  deliveryFeeMinor: 5_000,
  note: null,
  createdAt,
  acceptedAt: null,
  finishedAt: null,
  estimatedReadyAt: null,
  estimatedDeliveryAt: null,
  prepMinutes: null,
  etaMinutes: null,
  items: [],
  events: [],
};

function restaurantMock(
  handle: (path: string, options?: RequestOptions) => unknown,
) {
  const calls = vi.fn(handle);
  function request<T>(
    path: string,
    options: RequestOptions | undefined,
    schema: ResponseSchema<T>,
  ): Promise<T>;
  function request(path: string, options?: RequestOptions): Promise<unknown>;
  async function request<T>(
    path: string,
    options?: RequestOptions,
    schema?: ResponseSchema<T>,
  ) {
    const value = await calls(path, options);
    return schema ? schema.parse(value) : value;
  }
  return { calls, request };
}

function hostById(renderer: ReactTestRenderer, id: string) {
  return renderer.root.findAll(
    (node) => typeof node.type === "string" && node.props.testID === id,
  );
}

function press(node: ReactTestInstance) {
  const onPress = node.props.onPress as unknown;
  if (typeof onPress !== "function")
    throw new Error("Expected an interactive element.");
  onPress();
}

const consoleProps = {
  role: "OWNER",
  mode: "OLD",
  serverOffsetMs: 0,
  expireAfterSec: 480,
  acceptingOrders: true,
  foreground: true,
  connected: true,
} as const;
const detailProps = {
  mode: "OLD",
  isOffline: false,
  serverNow: Date.parse(createdAt),
  expireAfterSec: 480,
  onClose: () => undefined,
  onTransition: async () => undefined,
} as const;

let renderer: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  const mounted = renderer;
  if (mounted)
    await act(async () => {
      mounted.unmount();
    });
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function mount(element: ReactElement) {
  await act(async () => {
    renderer = create(element);
  });
  if (!renderer) throw new Error("Order component was not mounted.");
  return renderer;
}

it("keeps order tabs and choice chips at least 48dp across", async () => {
  const fixture = restaurantMock(() => ({ orders: [pending] }));
  const tree = await mount(
    <>
      <OrderConsole {...consoleProps} request={fixture.request} />
      <Choices
        label={text.title}
        selected="one"
        values={[{ id: "one", label: text.title }]}
        onSelect={() => undefined}
      />
    </>,
  );
  const tabsAndChips = tree.root.findAll(
    (node) => typeof node.type === "string" && node.props.accessibilityState?.selected !== undefined,
  );
  expect(tabsAndChips).toHaveLength(Object.keys(text.tabs).length + 1);
  for (const control of tabsAndChips) {
    expect([control.props.style as unknown].flat(3)).toContainEqual(
      expect.objectContaining({ minWidth: 48, minHeight: 48 }),
    );
  }
});

it("renders exactly the transitions from the shared state machine for every status, role and order type", async () => {
  const tree = await mount(
    <OrderDetail order={pending} role="OWNER" {...detailProps} />,
  );
  for (const status of ORDER_STATUSES) {
    for (const role of RESTAURANT_ROLES) {
      for (const type of ORDER_TYPES) {
        await act(async () => {
          tree.update(
            <OrderDetail
              order={{ ...pending, status, type }}
              role={role}
              {...detailProps}
            />,
          );
        });
        const actions = tree.root.findAll(
          ({ type, props }) =>
            typeof type === "string" &&
            typeof props.testID === "string" &&
            props.testID.startsWith("transition-"),
        );
        expect(actions.map(({ props }) => props.testID)).toEqual(
          allowedTransitions(status, { type: "RESTAURANT", role }, type).map(
            (target) => `transition-${target}`,
          ),
        );
      }
    }
  }
});

it("never renders phone, address, money or accept/reject for KITCHEN even if present in a response", async () => {
  const tree = await mount(
    <OrderDetail order={pending} role="KITCHEN" {...detailProps} />,
  );
  for (const id of [
    "order-customer-phone",
    "order-customer-address",
    "order-amounts",
    "transition-ACCEPTED",
    "transition-REJECTED",
  ]) {
    expect(hostById(tree, id)).toHaveLength(0);
  }
  await act(async () => {
    tree.update(<OrderDetail order={pending} role="OWNER" {...detailProps} />);
  });
  for (const id of [
    "order-customer-phone",
    "order-customer-address",
    "order-amounts",
    "transition-ACCEPTED",
    "transition-REJECTED",
  ]) {
    expect(hostById(tree, id)).toHaveLength(1);
  }
});

it("shows disconnection after polling fails and clears it at the first successful ten-second poll", async () => {
  vi.useFakeTimers();
  let failure = true;
  const fixture = restaurantMock(() => {
    if (failure) throw new Error("Fixture network failure.");
    return { orders: [pending] };
  });
  const tree = await mount(
    <OrderConsole {...consoleProps} request={fixture.request} />,
  );
  expect(fixture.calls).toHaveBeenCalledTimes(1);
  expect(hostById(tree, "orders-offline")).toHaveLength(1);
  failure = false;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9999);
  });
  expect(fixture.calls).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(fixture.calls).toHaveBeenCalledTimes(2);
  expect(hostById(tree, "orders-offline")).toHaveLength(0);
  expect(hostById(tree, `order-row-${pending.id}`)).toHaveLength(1);
});

it("issues one transition request when the preparation time is pressed twice before the server replies", async () => {
  let release: ((order: OrderReadResponse) => void) | undefined;
  const response = new Promise<OrderReadResponse>((resolve) => {
    release = resolve;
  });
  const fixture = restaurantMock((path, options) => {
    if (options?.method === "POST") return response;
    return path.endsWith("/active") ? { orders: [pending] } : pending;
  });
  const tree = await mount(
    <OrderConsole {...consoleProps} request={fixture.request} />,
  );
  await act(async () => {
    press(hostById(tree, `order-row-${pending.id}`)[0]!);
  });
  await act(async () => {
    press(hostById(tree, "transition-ACCEPTED")[0]!);
  });
  const prep = hostById(tree, "prep-15")[0]!;
  await act(async () => {
    press(prep);
    press(prep);
  });
  const writes = fixture.calls.mock.calls.filter(
    ([, options]) => options?.method === "POST",
  );
  expect(writes).toEqual([
    [
      `/restaurant/orders/${pending.id}/transition`,
      { method: "POST", body: { to: "ACCEPTED", prepMinutes: 15 } },
    ],
  ]);
  await act(async () => {
    release?.({ ...pending, status: "ACCEPTED", prepMinutes: 15 });
  });
});

it("pulls immediately on foreground and reconnect and rings only until the pending order is opened", async () => {
  const fixture = restaurantMock((path) =>
    path.endsWith("/active") ? { orders: [pending] } : pending,
  );
  const alert = createElement("SoundFixture", { testID: "new-order-sound" });
  const tree = await mount(
    <OrderConsole
      {...consoleProps}
      foreground={false}
      request={fixture.request}
      alert={alert}
    />,
  );
  expect(fixture.calls).toHaveBeenCalledTimes(0);
  await act(async () => {
    tree.update(
      <OrderConsole
        {...consoleProps}
        request={fixture.request}
        alert={alert}
      />,
    );
  });
  expect(fixture.calls).toHaveBeenCalledTimes(1);
  expect(hostById(tree, "new-order-sound")).toHaveLength(1);
  await act(async () => {
    tree.update(
      <OrderConsole
        {...consoleProps}
        connected={false}
        request={fixture.request}
        alert={alert}
      />,
    );
  });
  expect(hostById(tree, "orders-offline")).toHaveLength(1);
  expect(hostById(tree, "new-order-sound")).toHaveLength(0);
  await act(async () => {
    tree.update(
      <OrderConsole
        {...consoleProps}
        request={fixture.request}
        alert={alert}
      />,
    );
  });
  expect(fixture.calls).toHaveBeenCalledTimes(2);
  expect(hostById(tree, "new-order-sound")).toHaveLength(1);
  await act(async () => {
    press(hostById(tree, `order-row-${pending.id}`)[0]!);
  });
  expect(hostById(tree, "new-order-sound")).toHaveLength(0);
  expect(
    responseCountdown(createdAt, 480, Date.parse(createdAt) + 60_000),
  ).toBe("7:00");
});

it("continues pulling and ringing on another tab without keeping the orders screen visible", async () => {
  vi.useFakeTimers();
  const fixture = restaurantMock(() => ({ orders: [pending] }));
  const alert = createElement("SoundFixture", { testID: "new-order-sound" });
  const tree = await mount(
    <OrderConsole
      {...consoleProps}
      request={fixture.request}
      visible={false}
      alert={alert}
    />,
  );
  expect(hostById(tree, `order-row-${pending.id}`)).toHaveLength(0);
  expect(hostById(tree, "new-order-sound")).toHaveLength(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(fixture.calls.mock.calls.map(([path]) => path)).toEqual([
    "/restaurant/orders/active",
    "/restaurant/orders/active",
  ]);
});

it("keeps the disconnection banner until the active pull succeeds after native reconnect", async () => {
  let release:
    ((response: { orders: OrderReadResponse[] }) => void) | undefined;
  const deferred = new Promise<{ orders: OrderReadResponse[] }>((resolve) => {
    release = resolve;
  });
  const fixture = restaurantMock(() => deferred);
  const connection = vi.fn();
  const tree = await mount(
    <OrderConsole
      {...consoleProps}
      connected={false}
      onConnectionChange={connection}
      request={fixture.request}
    />,
  );
  expect(hostById(tree, "orders-offline")).toHaveLength(1);
  expect(fixture.calls).not.toHaveBeenCalled();
  await act(async () => {
    tree.update(
      <OrderConsole
        {...consoleProps}
        onConnectionChange={connection}
        request={fixture.request}
      />,
    );
  });
  expect(fixture.calls).toHaveBeenCalledTimes(1);
  expect(hostById(tree, "orders-offline")).toHaveLength(1);
  expect(connection).toHaveBeenLastCalledWith({
    offline: true,
    lastUpdatedAt: undefined,
  });
  await act(async () => {
    release?.({ orders: [pending] });
  });
  expect(hostById(tree, "orders-offline")).toHaveLength(0);
  expect(connection).toHaveBeenLastCalledWith({
    offline: false,
    lastUpdatedAt: expect.any(String),
  });
});
