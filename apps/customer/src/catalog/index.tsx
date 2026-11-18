import type { PublicRestaurantDetailResponse } from "@be-fast/contracts";
import { formatMoney, validateMenuOptions } from "@be-fast/domain";
import { customerCatalog as text } from "@be-fast/i18n";
import { useState } from "react";
import { useAndroidBack } from "../android-back";
import { View } from "react-native";
import type { CustomerRequest } from "../api";
import { Button, EmptyState, ScrollScreen } from "../ui";
import { foodSubtotal } from "./cart";
import { BrowseScreen } from "./browse";
import { ItemCustomizer, type ItemSelection } from "./item";
import { MenuList, useRestaurantMenu, type CartSummary } from "./menu";
import { CatalogNotice, catalogStyles as styles } from "./shared";
import type { Cart, Region } from "./types";

export type { Cart, CartLine, Region } from "./types";
export { RegionPicker } from "./region";
export { CartScreen } from "./cart";

interface CatalogProps {
  region: Region | null;
  request: CustomerRequest;
  cart: Cart | null;
  selectedAddressLabel?: string;
  onChooseRegion: () => void;
  onOpenCart: () => void;
  onChangeCart: (cart: Cart | null) => void;
}

export function summarizeCart(cart: Cart | null): CartSummary | null {
  if (!cart || cart.items.length === 0) return null;
  const subtotal = foodSubtotal(cart.items);
  return {
    count: cart.items.reduce((sum, line) => sum + line.quantity, 0),
    label:
      subtotal === undefined ? "" : formatMoney(subtotal, cart.currencyDisplayMode),
  };
}

function cartWithItem(
  restaurant: PublicRestaurantDetailResponse,
  previous: Cart | null,
  selection: ItemSelection,
): Cart {
  const items = previous?.restaurantId === restaurant.id ? previous.items : [];
  const keys = new Set(items.map(({ key }) => key));
  let ordinal = 1;
  let key = `${selection.menuItemId}:${ordinal}`;
  while (keys.has(key)) {
    ordinal++;
    key = `${selection.menuItemId}:${ordinal}`;
  }
  return {
    restaurantId: restaurant.id,
    branchId: restaurant.branchId,
    restaurantName: restaurant.name ?? text.unnamedRestaurant,
    pickupEnabled: restaurant.pickupEnabled,
    deliveryFeeMinor: restaurant.deliveryFeeMinor,
    minOrderMinor: restaurant.minOrderMinor,
    etaMinutes: restaurant.etaMinutes,
    currencyDisplayMode: restaurant.currencyDisplayMode,
    items: [...items, { ...selection, key }],
  };
}

function RestaurantCatalog({
  id,
  region,
  request,
  cart,
  onChangeCart,
  onBack,
  onOpenCart,
}: {
  id: string;
  region: Region;
  request: CustomerRequest;
  cart: Cart | null;
  onChangeCart: CatalogProps["onChangeCart"];
  onBack: () => void;
  onOpenCart: () => void;
}) {
  const menu = useRestaurantMenu(id, region.neighborhoodId, request);
  const restaurant = menu.data;
  const [itemId, setItemId] = useState<string | null>(null);
  const [replacement, setReplacement] = useState<ItemSelection | null>(null);
  const item = restaurant?.sections
    .flatMap(({ items }) => items)
    .find((candidate) => candidate.id === itemId);
  useAndroidBack(
    replacement && restaurant
      ? () => setReplacement(null)
      : item && restaurant
        ? () => setItemId(null)
        : onBack,
  );

  function canSelect(selection: ItemSelection) {
    return (
      !!restaurant?.isOrderable &&
      !!item?.isAvailable &&
      item.id === selection.menuItemId &&
      item.sizes.some(({ id }) => id === selection.sizeId) &&
      validateMenuOptions(item.optionGroups, selection.optionIds)
    );
  }

  function add(selection: ItemSelection, confirmed = false) {
    if (!restaurant || !canSelect(selection)) return;
    if (
      cart?.items.length &&
      cart.restaurantId !== restaurant.id &&
      !confirmed
    ) {
      setReplacement(selection);
      return;
    }
    onChangeCart(cartWithItem(restaurant, cart, selection));
    setReplacement(null);
    setItemId(null);
  }

  if (replacement && restaurant) {
    return (
      <ScrollScreen>
        <EmptyState
          icon="bag"
          title={text.cartConflict}
          action={
            <View style={styles.stack}>
              <Button
                label={text.replaceCart}
                primary
                icon="refresh"
                onPress={() => add(replacement, true)}
                disabled={!canSelect(replacement)}
              />
              <Button
                label={text.keepCart}
                variant="soft"
                onPress={() => setReplacement(null)}
              />
            </View>
          }
        />
      </ScrollScreen>
    );
  }
  if (item && restaurant) {
    return (
      <View style={styles.root}>
        {(menu.isError ||
          (menu.dataUpdatedAt > 0 && menu.failureCount > 0)) && (
          <CatalogNotice
            loading={false}
            error
            dataUpdatedAt={menu.dataUpdatedAt}
            retry={() => {
              void menu.refetch();
            }}
          />
        )}
        <ItemCustomizer
          key={item.id}
          item={item}
          mode={restaurant.currencyDisplayMode}
          available={restaurant.isOrderable}
          onAdd={add}
          onBack={() => setItemId(null)}
        />
      </View>
    );
  }
  return (
    <MenuList
      menu={menu}
      cartSummary={cart?.restaurantId === id ? summarizeCart(cart) : null}
      onBack={onBack}
      onOpenCart={onOpenCart}
      onOpenItem={setItemId}
    />
  );
}

function RegionCatalog({
  region,
  request,
  cart,
  selectedAddressLabel,
  onChooseRegion,
  onOpenCart,
  onChangeCart,
}: Omit<CatalogProps, "region"> & { region: Region }) {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  if (restaurantId) {
    return (
      <RestaurantCatalog
        key={restaurantId}
        id={restaurantId}
        request={request}
        region={region}
        cart={cart}
        onChangeCart={onChangeCart}
        onBack={() => setRestaurantId(null)}
        onOpenCart={onOpenCart}
      />
    );
  }
  return (
    <BrowseScreen
      region={region}
      request={request}
      selectedAddressLabel={selectedAddressLabel}
      onChooseRegion={onChooseRegion}
      onOpenRestaurant={setRestaurantId}
      onOpenCart={onOpenCart}
      cartCount={summarizeCart(cart)?.count ?? 0}
    />
  );
}

export function CatalogScreen(props: CatalogProps) {
  if (props.region)
    return (
      <RegionCatalog
        {...props}
        region={props.region}
        key={props.region.neighborhoodId}
      />
    );
  return (
    <ScrollScreen>
      <EmptyState
        icon="pin"
        title={text.browseTitle}
        message={text.stepArea}
        action={
          <Button label={text.chooseArea} onPress={props.onChooseRegion} primary icon="pin" />
        }
      />
    </ScrollScreen>
  );
}
