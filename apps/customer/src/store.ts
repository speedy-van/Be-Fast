import {
  customerAddressListSchema,
  customerProfileSchema,
  orderCreateSchema,
} from "@be-fast/contracts";
import { z } from "zod";
import { createStore } from "zustand/vanilla";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import type { Cart, Region } from "./catalog/types";

const id = z.uuid();
const price = z.int().nonnegative();
const regionSchema = z.object({
  governorateId: id,
  governorateName: z.string(),
  cityId: id,
  cityName: z.string(),
  neighborhoodId: id,
  neighborhoodName: z.string(),
});
const cartSchema = z.object({
  restaurantId: id,
  branchId: id,
  restaurantName: z.string(),
  pickupEnabled: z.boolean(),
  deliveryFeeMinor: price,
  minOrderMinor: price,
  etaMinutes: z.int().nonnegative(),
  currencyDisplayMode: z.enum(["OLD", "NEW"]),
  items: z
    .array(
      z.object({
        key: z.string(),
        menuItemId: id,
        sizeId: id,
        optionIds: z.array(id),
        quantity: z.int().min(1).max(50),
        note: z.string().max(200).optional(),
        name: z.string(),
        sizeName: z.string(),
        optionNames: z.array(z.string()),
        sizePriceMinor: price,
        optionPricesMinor: z.array(price),
      }),
    )
    .min(1),
});
const attemptSchema = z.object({
  key: id,
  body: orderCreateSchema.optional(),
  uncertain: z.boolean(),
  priceChange: z
    .object({
      foodSubtotalMinor: price,
      deliveryFeeMinor: price,
      discountMinor: price,
      totalMinor: price,
    })
    .optional(),
});
const stored = z.object({
  region: regionSchema.nullable(),
  cart: cartSchema.nullable(),
  attempt: attemptSchema.nullable(),
  profile: customerProfileSchema.nullable(),
  addresses: customerAddressListSchema,
  selectedAddressId: id.nullable(),
});
export type CheckoutAttempt = z.infer<typeof attemptSchema>;
type Saved = z.infer<typeof stored>;

interface CustomerState extends Saved {
  setRegion: (region: Region) => void;
  setCart: (cart: Cart | null) => void;
  setAttempt: (attempt: CheckoutAttempt | null) => void;
  setProfile: (profile: NonNullable<Saved["profile"]>) => void;
  setAddresses: (addresses: Saved["addresses"]) => void;
  selectAddress: (id: string) => void;
  clearAccount: () => void;
}

const baseAccount = {
  profile: null,
  addresses: [],
  selectedAddressId: null,
  attempt: null,
};
const initial: Saved = { region: null, cart: null, ...baseAccount };
const key = "befast-customer-v1";

export function createCustomerStore(storage: StateStorage) {
  let latest = Promise.resolve();
  let tail = latest;
  function enqueue(write: () => unknown) {
    latest = tail.then(async () => {
      await write();
    });
    tail = latest.catch(() => undefined);
    return tail;
  }

  const state = createStore<CustomerState>()(
    persist(
      (set) => ({
        ...initial,
        setRegion: (region) => set({ region }),
        setCart: (cart) =>
          set((previous) => ({
            cart,
            attempt:
              JSON.stringify(previous.cart) === JSON.stringify(cart)
                ? previous.attempt
                : null,
          })),
        setAttempt: (attempt) => set({ attempt }),
        setProfile: (profile) =>
          set((previous) =>
            previous.profile && previous.profile.id !== profile.id
              ? { ...baseAccount, profile }
              : { profile },
          ),
        setAddresses: (addresses) =>
          set((previous) => ({
            addresses,
            selectedAddressId: addresses.some(
              ({ id }) => id === previous.selectedAddressId,
            )
              ? previous.selectedAddressId
              : (addresses.find(({ isDefault }) => isDefault)?.id ??
                addresses[0]?.id ??
                null),
          })),
        selectAddress: (selectedAddressId) =>
          set((previous) =>
            previous.addresses.some(({ id }) => id === selectedAddressId)
              ? { selectedAddressId }
              : previous,
          ),
        clearAccount: () => set(baseAccount),
      }),
      {
        name: key,
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: (name) => storage.getItem(name),
          setItem: (name, value) => enqueue(() => storage.setItem(name, value)),
          removeItem: (name) => enqueue(() => storage.removeItem(name)),
        })),
        partialize: ({
          region,
          cart,
          attempt,
          profile,
          addresses,
          selectedAddressId,
        }) => ({
          region,
          cart,
          attempt,
          profile,
          addresses,
          selectedAddressId,
        }),
        merge: (value, current) => {
          const result = stored.safeParse(value);
          return result.success ? { ...current, ...result.data } : current;
        },
      },
    ),
  );
  return { state, flush: () => latest };
}
