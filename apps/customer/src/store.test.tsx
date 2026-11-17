import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it } from "vitest";
import { useStore } from "zustand";
import type { Cart, Region } from "./catalog/types";
import { createCustomerStore, type CheckoutAttempt } from "./store";

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
  deliveryFeeMinor: 2_000,
  minOrderMinor: 10_000,
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
      sizePriceMinor: 12_000,
      optionPricesMinor: [],
    },
  ],
};
const address = {
  id: id(8),
  neighborhoodId: region.neighborhoodId,
  street: "Saved Street",
  landmark: "A landmark",
  building: null,
  floor: null,
  notes: null,
  label: "Home",
  longitude: null,
  latitude: null,
  isDefault: true,
};
const secondAddress = {
  ...address,
  id: id(9),
  street: "Other Street",
  isDefault: false,
};
const profile = { id: id(10), phone: "+963912345678", name: "Customer" };
const attempt: CheckoutAttempt = {
  key: id(11),
  uncertain: true,
  body: {
    type: "DELIVERY",
    branchId: cart.branchId,
    addressId: secondAddress.id,
    expectedTotalMinor: 14_000,
    items: [{ menuItemId: id(6), sizeId: id(7), optionIds: [], quantity: 1 }],
  },
};

function deviceStorage() {
  const file = new Map<string, string>();
  return {
    getItem: async (key: string) => file.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      file.set(key, value);
    },
    removeItem: async (key: string) => {
      file.delete(key);
    },
  };
}

it("hydrates a fresh application component with the saved cart and chosen address after restarting", async () => {
  const storage = deviceStorage();
  const first = createCustomerStore(storage);
  first.state.getState().setRegion(region);
  first.state.getState().setCart(cart);
  first.state.getState().setProfile(profile);
  first.state.getState().setAddresses([address, secondAddress]);
  first.state.getState().selectAddress(secondAddress.id);
  first.state.getState().setAttempt(attempt);
  await first.flush();

  const restarted = createCustomerStore(storage);
  let value: ReturnType<typeof restarted.state.getState> | undefined;
  function CheckoutState() {
    value = useStore(restarted.state);
    return null;
  }
  const environment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(<CheckoutState />);
    });
    expect(value).toMatchObject({ cart: null, selectedAddressId: null });
    await act(async () => {
      await restarted.state.persist.rehydrate();
    });
    expect(value).toMatchObject({
      region,
      cart,
      profile,
      addresses: [address, secondAddress],
      selectedAddressId: secondAddress.id,
      attempt,
    });
    await act(async () => {
      restarted.state
        .getState()
        .setCart({
          ...cart,
          items: cart.items.map((item) => ({ ...item, quantity: 2 })),
        });
    });
    expect(value).toMatchObject({ attempt: null });
  } finally {
    await act(async () => {
      renderer?.unmount();
    });
    delete environment.IS_REACT_ACT_ENVIRONMENT;
  }
});

it("clears persisted customer details and unfinished requests but retains public region and cart after logout", async () => {
  const storage = deviceStorage();
  const device = createCustomerStore(storage);
  device.state.getState().setRegion(region);
  device.state.getState().setCart(cart);
  device.state.getState().setProfile(profile);
  device.state.getState().setAddresses([address]);
  device.state.getState().setAttempt(attempt);
  await device.flush();
  device.state.getState().clearAccount();
  await device.flush();
  const restarted = createCustomerStore(storage);
  await restarted.state.persist.rehydrate();
  expect(restarted.state.getState()).toMatchObject({
    region,
    cart,
    attempt: null,
    profile: null,
    addresses: [],
    selectedAddressId: null,
  });
});
