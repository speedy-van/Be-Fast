import type { PublicRestaurantDetailResponse } from "@be-fast/contracts";
import { validateMenuOptions } from "@be-fast/domain";
import { customerCatalog as text } from "@be-fast/i18n";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import type { CustomerRequest } from "../api";
import { AppText } from "../ui";
import { BrowseScreen } from "./browse";
import { ItemCustomizer, type ItemSelection } from "./item";
import { MenuList, useRestaurantMenu } from "./menu";
import {
  CatalogButton,
  CatalogNotice,
  catalogStyles as styles,
} from "./shared";
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
      <ScrollView contentContainerStyle={styles.content}>
        <AppText accessibilityRole="alert" title>
          {text.cartConflict}
        </AppText>
        <CatalogButton
          label={text.replaceCart}
          primary
          onPress={() => add(replacement, true)}
          disabled={!canSelect(replacement)}
        />
        <CatalogButton
          label={text.keepCart}
          onPress={() => setReplacement(null)}
        />
      </ScrollView>
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
    <View style={styles.content}>
      <AppText accessibilityRole="header" title>
        {text.browseTitle}
      </AppText>
      <CatalogButton
        label={text.chooseArea}
        onPress={props.onChooseRegion}
        primary
      />
    </View>
  );
}
