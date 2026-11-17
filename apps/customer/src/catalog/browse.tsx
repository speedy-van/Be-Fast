import {
  browseListResponseSchema,
  publicFoodCategoriesSchema,
  type BrowseListPage,
} from "@be-fast/contracts";
import { formatMoney } from "@be-fast/domain";
import { customerCatalog as text } from "@be-fast/i18n";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import type { CustomerRequest } from "../api";
import { AppText, Field } from "../ui";
import { usePublicQuery } from "./query";
import {
  CatalogButton,
  CatalogImage,
  CatalogNotice,
  catalogStyles as styles,
} from "./shared";
import type { Region } from "./types";

type Restaurant = BrowseListPage["restaurants"][number];

export function browsePath(
  neighborhoodId: string,
  categoryId?: string,
  search?: string,
) {
  const params = new URLSearchParams({ neighborhoodId });
  if (categoryId) params.set("categoryId", categoryId);
  if (search) params.set("q", search);
  return `/public/restaurants?${params.toString()}`;
}

function useRestaurants(path: string, request: CustomerRequest) {
  return useInfiniteQuery({
    queryKey: ["public", path] as const,
    initialPageParam: null as BrowseListPage["nextCursor"],
    queryFn: ({ pageParam, signal }) =>
      request(
        pageParam === null
          ? path
          : `${path}&cursor=${encodeURIComponent(pageParam)}`,
        { signal },
        browseListResponseSchema,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    networkMode: "always",
  });
}

function RestaurantCard({
  restaurant,
  mode,
  onOpen,
}: {
  restaurant: Restaurant;
  mode: BrowseListPage["currencyDisplayMode"];
  onOpen: () => void;
}) {
  const name = restaurant.name ?? text.unnamedRestaurant;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      testID={`catalog-restaurant-${restaurant.id}`}
      onPress={onOpen}
      style={[styles.card, !restaurant.isOrderable && styles.unavailableCard]}
    >
      <View style={styles.spread}>
        <View style={[styles.stack, styles.flexText]}>
          <AppText title style={styles.heading}>
            {name}
          </AppText>
          {restaurant.categories.length > 0 && (
            <AppText muted>
              {restaurant.categories.map(({ name }) => name).join(" · ")}
            </AppText>
          )}
          <AppText>
            {restaurant.isOrderable ? text.available : text.closed}
          </AppText>
        </View>
        <CatalogImage
          imageKey={restaurant.logoKey}
          dimmed={!restaurant.isOrderable}
        />
      </View>
      <AppText muted>
        {text.delivery} {formatMoney(restaurant.deliveryFeeMinor, mode)} ·{" "}
        {text.minimum} {formatMoney(restaurant.minOrderMinor, mode)}
      </AppText>
      <AppText muted>
        {text.deliveryTime} {restaurant.etaMinutes} {text.minutes}
      </AppText>
    </Pressable>
  );
}

export function BrowseScreen({
  region,
  request,
  selectedAddressLabel,
  onChooseRegion,
  onOpenRestaurant,
  onOpenCart,
}: {
  region: Region;
  request: CustomerRequest;
  selectedAddressLabel?: string;
  onChooseRegion: () => void;
  onOpenRestaurant: (restaurantId: string) => void;
  onOpenCart: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategory] = useState<string>();
  const categories = usePublicQuery(
    "/public/categories",
    publicFoodCategoriesSchema,
    request,
  );
  const restaurants = useRestaurants(
    browsePath(region.neighborhoodId, categoryId, search),
    request,
  );
  const data =
    restaurants.data?.pages.flatMap(({ restaurants }) => restaurants) ?? [];
  const mode = restaurants.data?.pages[0]?.currencyDisplayMode ?? "OLD";
  const searchNow = () => setSearch(draft.trim());

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={data}
      initialNumToRender={5}
      windowSize={5}
      keyboardShouldPersistTaps="handled"
      keyExtractor={({ id }) => id}
      renderItem={({ item }) => (
        <RestaurantCard
          restaurant={item}
          mode={mode}
          onOpen={() => onOpenRestaurant(item.id)}
        />
      )}
      ListHeaderComponent={
        <View style={styles.stack}>
          <AppText title accessibilityRole="header">
            {text.browseTitle}
          </AppText>
          <AppText muted>{text.selectedAddress}</AppText>
          <View style={styles.row}>
            <CatalogButton
              label={selectedAddressLabel ?? region.neighborhoodName}
              onPress={onChooseRegion}
            />
            <CatalogButton label={text.openCart} onPress={onOpenCart} />
          </View>
          <Field
            label={text.search}
            placeholder={text.search}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={searchNow}
            returnKeyType="search"
          />
          <CatalogButton label={text.applySearch} onPress={searchNow} />
          <View style={styles.row}>
            <CatalogButton
              label={text.allCategories}
              selected={categoryId === undefined}
              onPress={() => setCategory(undefined)}
            />
            {categories.data?.map(({ id, name }) => (
              <CatalogButton
                key={id}
                label={name}
                selected={categoryId === id}
                onPress={() => setCategory(id)}
              />
            ))}
          </View>
          <CatalogNotice
            loading={restaurants.isPending}
            error={
              restaurants.isError ||
              (restaurants.dataUpdatedAt > 0 && restaurants.failureCount > 0)
            }
            dataUpdatedAt={restaurants.dataUpdatedAt}
            retry={() => {
              void restaurants.refetch();
            }}
          />
        </View>
      }
      ListEmptyComponent={
        restaurants.isSuccess ? (
          <AppText muted>{text.noRestaurants}</AppText>
        ) : undefined
      }
      ListFooterComponent={
        restaurants.hasNextPage ? (
          <CatalogButton
            label={restaurants.isFetchingNextPage ? text.loading : text.more}
            disabled={restaurants.isFetchingNextPage || restaurants.isFetching}
            onPress={() => {
              void restaurants.fetchNextPage();
            }}
          />
        ) : undefined
      }
    />
  );
}
