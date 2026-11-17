import { ApiClientError, type ResponseSchema } from "@be-fast/api-client";
import type { BrowseListPage } from "@be-fast/contracts";
import { calcItemTotal, formatMoney } from "@be-fast/domain";
import { customerCatalog as text } from "@be-fast/i18n";
import { GradientFill } from "@be-fast/ui-native";
import { gradients } from "@be-fast/ui-tokens";
import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  hydrate,
} from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CustomerRequestOptions } from "../api";
import { AppText, Button, Choices } from "../ui";
import { BrowseScreen, browsePath } from "./browse";
import { ItemCustomizer, QuantityControls, type CatalogItem } from "./item";
import { useRestaurantMenu } from "./menu";
import { CatalogButton } from "./shared";
import type { Region } from "./types";

vi.mock("expo-image", () => ({ Image: "Image" }));
vi.mock("react-native", async () => {
  const { createElement, Fragment } =
    await vi.importActual<typeof import("react")>("react");
  return {
    View: "View",
    Text: "Text",
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    TextInput: "TextInput",
    ActivityIndicator: "ActivityIndicator",
    StyleSheet: { create: <T,>(styles: T) => styles },
    FlatList: ({
      data,
      keyExtractor,
      renderItem,
      ListHeaderComponent,
      ListEmptyComponent,
      ListFooterComponent,
    }: {
      data: readonly unknown[];
      keyExtractor: (item: unknown, index: number) => string;
      renderItem: (args: { item: unknown; index: number }) => ReactNode;
      ListHeaderComponent?: ReactNode;
      ListEmptyComponent?: ReactNode;
      ListFooterComponent?: ReactNode;
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
        ListFooterComponent,
      ),
  };
});

const id = (value: number) =>
  `aa111111-1111-4111-8111-${String(value).padStart(12, "0")}`;
const sizeA = { id: id(1), name: "Size A", priceMinor: 10_500, sortOrder: 0 };
const sizeB = { id: id(2), name: "Size B", priceMinor: 15_250, sortOrder: 1 };
const requiredA = {
  id: id(3),
  name: "Required A",
  priceMinor: 125,
  sortOrder: 0,
  isAvailable: true,
};
const requiredB = {
  id: id(4),
  name: "Required B",
  priceMinor: 450,
  sortOrder: 1,
  isAvailable: true,
};
const optionalA = {
  id: id(5),
  name: "Optional A",
  priceMinor: 1_000,
  sortOrder: 0,
  isAvailable: true,
};
const optionalB = {
  id: id(6),
  name: "Optional B",
  priceMinor: 0,
  sortOrder: 1,
  isAvailable: true,
};
const unavailable = {
  id: id(7),
  name: "Unavailable",
  priceMinor: 90,
  sortOrder: 2,
  isAvailable: false,
};

const item: CatalogItem = {
  id: id(8),
  name: "Fixture meal",
  description: null,
  imageKey: null,
  isAvailable: true,
  availableFrom: null,
  availableTo: null,
  sortOrder: 0,
  sizes: [sizeA, sizeB],
  optionGroups: [
    {
      id: id(9),
      name: "Required options",
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 0,
      options: [requiredA, requiredB],
    },
    {
      id: id(10),
      name: "Optional options",
      minSelect: 0,
      maxSelect: 2,
      sortOrder: 1,
      options: [optionalA, optionalB, unavailable],
    },
  ],
};

function customerMock(handle: (path: string) => unknown) {
  const calls = vi.fn(handle);
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
    _options?: CustomerRequestOptions,
    schema?: ResponseSchema<T>,
  ) {
    const data = await calls(path);
    return schema ? schema.parse(data) : data;
  }
  return { calls, request };
}

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
});

async function mount(element: ReactElement) {
  await act(async () => {
    renderer = create(element);
  });
  if (!renderer) throw new Error("Catalog screen did not mount.");
  return renderer;
}

function hosts(tree: ReactTestRenderer, testID: string) {
  return tree.root.findAll(
    (node) => typeof node.type === "string" && node.props.testID === testID,
  );
}

function host(tree: ReactTestRenderer, testID: string) {
  const element = hosts(tree, testID)[0];
  if (!element) throw new Error(`Element ${testID} did not render.`);
  return element;
}

function press(tree: ReactTestRenderer, testID: string) {
  const callback = host(tree, testID).props.onPress as unknown;
  if (typeof callback !== "function")
    throw new Error(`Element ${testID} is not interactive.`);
  callback();
}

const noOp = () => undefined;

it("keeps catalog actions and compact controls at least 48dp across", async () => {
  const tree = await mount(
    <>
      <Button compact label={text.back} testID="compact-action" onPress={noOp} />
      <CatalogButton
        label={text.allCategories}
        testID="catalog-action"
        onPress={noOp}
      />
      <Choices
        label={text.quantity}
        selected="one"
        values={[{ id: "one", label: text.quantity }]}
        onSelect={noOp}
      />
      <QuantityControls compact quantity={2} onChange={noOp} />
    </>,
  );

  const segment = tree.root.find(
    (node) =>
      typeof node.type === "string" && node.props.accessibilityRole === "radio",
  );
  for (const control of [host(tree, "compact-action"), host(tree, "catalog-action"), segment]) {
    expect(Object.assign({}, ...[control.props.style as unknown].flat(3))).toMatchObject(
      { minWidth: 48, minHeight: 48 },
    );
  }
  for (const id of ["quantity-plus", "quantity-minus"]) {
    expect([host(tree, id).props.style as unknown].flat(3)).toContainEqual(
      expect.objectContaining({ width: 48, height: 48 }),
    );
  }
});

it("enables Add to Cart only while the required group is satisfied", async () => {
  const add = vi.fn();
  const tree = await mount(
    <ItemCustomizer
      item={item}
      mode="OLD"
      available
      onAdd={add}
      onBack={noOp}
    />,
  );
  const button = () => host(tree, "customer-add-to-cart");
  expect(button().props.disabled).toBe(true);
  expect(host(tree, `option-${unavailable.id}`).props.disabled).toBe(true);
  await act(async () => {
    press(tree, `option-${optionalA.id}`);
  });
  expect(button().props.disabled).toBe(true);
  await act(async () => {
    press(tree, `option-${requiredA.id}`);
  });
  expect(button().props.disabled).toBe(false);
  await act(async () => {
    press(tree, "customer-add-to-cart");
  });
  expect(add).toHaveBeenCalledWith(
    expect.objectContaining({
      optionIds: [requiredA.id, optionalA.id],
      quantity: 1,
    }),
  );
  await act(async () => {
    press(tree, `option-${requiredA.id}`);
  });
  expect(button().props.disabled).toBe(true);
});

const optionalSubsets = [[], [optionalA], [optionalB], [optionalA, optionalB]];
const pricingCases = (["OLD", "NEW"] as const).flatMap((mode) =>
  item.sizes.flatMap((size) =>
    [requiredA, requiredB].flatMap((required) =>
      optionalSubsets.map((options) => ({
        mode,
        size,
        chosen: [required, ...options],
        name: `${mode} · ${size.name} · ${[required, ...options].map(({ name }) => name).join(", ")}`,
      })),
    ),
  ),
);

it.each(pricingCases)(
  "$name uses calcItemTotal for every quantity from 1 to 50",
  async ({ mode, size, chosen }) => {
    const tree = await mount(
      <ItemCustomizer
        item={item}
        mode={mode}
        available
        onAdd={noOp}
        onBack={noOp}
      />,
    );
    act(() => {
      press(tree, `size-${size.id}`);
      for (const option of chosen) press(tree, `option-${option.id}`);
    });
    const optionPricesMinor = chosen.map(({ priceMinor }) => priceMinor);
    for (let quantity = 1; quantity <= 50; quantity++) {
      const expected = calcItemTotal(
        size.priceMinor,
        optionPricesMinor,
        quantity,
      );
      expect(host(tree, "customer-item-price").props.children).toBe(
        formatMoney(expected, mode),
      );
      if (quantity < 50)
        act(() => {
          press(tree, "quantity-plus");
        });
    }
  },
);

const region: Region = {
  governorateId: id(11),
  governorateName: "Test governorate",
  cityId: id(12),
  cityName: "Test city",
  neighborhoodId: id(13),
  neighborhoodName: "Test neighborhood",
};
const page: BrowseListPage = {
  restaurants: [
    {
      id: id(14),
      branchId: id(15),
      name: "Cached restaurant",
      logoKey: null,
      categories: [],
      isOrderable: true,
      reason: null,
      deliveryFeeMinor: 125,
      minOrderMinor: 5_000,
      etaMinutes: 30,
    },
  ],
  nextCursor: null,
  currencyDisplayMode: "OLD",
};

function queryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

it("uses the contrast-tested hero gradient and 48dp search control", async () => {
  const client = queryClient();
  const online = customerMock((path) =>
    path === "/public/categories" ? [] : page,
  );
  const tree = await mount(
    <QueryClientProvider client={client}>
      <BrowseScreen
        region={region}
        request={online.request}
        onChooseRegion={noOp}
        onOpenCart={noOp}
        onOpenRestaurant={noOp}
      />
    </QueryClientProvider>,
  );
  const hero = tree.root
    .findAllByType(GradientFill)
    .find(({ props }) => props.id === "hero");
  expect(hero?.props).toMatchObject({
    from: gradients.brand[0],
    to: gradients.brand[1],
  });
  const search = tree.root.find(
    (node) => typeof node.type === "string" && node.props.accessibilityLabel === text.applySearch,
  );
  expect([search.props.style as unknown].flat(3)).toContainEqual(
    expect.objectContaining({ width: 48, height: 48 }),
  );
});

it("keeps the last browse result after restart and labels it stale when the network refresh fails", async () => {
  const online = customerMock((path) =>
    path === "/public/categories" ? [] : page,
  );
  const first = queryClient();
  const render = (client: QueryClient, request: typeof online.request) => (
    <QueryClientProvider client={client}>
      <BrowseScreen
        region={region}
        request={request}
        onChooseRegion={noOp}
        onOpenCart={noOp}
        onOpenRestaurant={noOp}
      />
    </QueryClientProvider>
  );
  const initial = await mount(render(first, online.request));
  const restaurant = `catalog-restaurant-${id(14)}`;
  await vi.waitFor(() => expect(hosts(initial, restaurant)).toHaveLength(1));
  const persisted = JSON.parse(JSON.stringify(dehydrate(first))) as ReturnType<
    typeof dehydrate
  >;
  await act(async () => {
    initial.unmount();
  });
  first.clear();

  const restored = queryClient();
  hydrate(restored, persisted);
  const offline = customerMock(() => {
    throw new Error("Fixture offline.");
  });
  const offlineTree = await mount(render(restored, offline.request));
  expect(hosts(offlineTree, restaurant)).toHaveLength(1);
  await vi.waitFor(() =>
    expect(hosts(offlineTree, "catalog-stale")).toHaveLength(1),
  );
  expect(String(host(offlineTree, "catalog-stale").props.children)).toContain(
    text.lastUpdated,
  );
  expect(offline.calls.mock.calls).toContainEqual([
    browsePath(region.neighborhoodId),
  ]);
});

it("drops cached menu details when the server confirms that the restaurant is no longer public", async () => {
  const listed = page.restaurants[0]!;
  const client = queryClient();
  const menuPath = `/public/restaurants/${listed.id}?neighborhoodId=${region.neighborhoodId}`;
  client.setQueryData(["public", menuPath], {
    ...listed,
    coverImageKey: null,
    contactPhone: null,
    pickupEnabled: false,
    currencyDisplayMode: page.currencyDisplayMode,
    sections: [],
  });
  const missing = customerMock(() => {
    throw new ApiClientError(404);
  });
  function MenuProbe() {
    const menu = useRestaurantMenu(
      listed.id,
      region.neighborhoodId,
      missing.request,
    );
    return (
      <AppText testID="menu-privacy-probe">
        {menu.data ? menu.data.name : text.noMenu}
      </AppText>
    );
  }
  const tree = await mount(
    <QueryClientProvider client={client}>
      <MenuProbe />
    </QueryClientProvider>,
  );
  await vi.waitFor(() =>
    expect(host(tree, "menu-privacy-probe").props.children).toBe(text.noMenu),
  );
  expect(client.getQueryData(["public", menuPath])).toBeNull();
});
