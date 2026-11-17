import {
  browseListResponseSchema,
  publicFoodCategoriesSchema,
  type BrowseListPage,
} from "@be-fast/contracts";
import { formatMoney } from "@be-fast/domain";
import { customerCatalog as text } from "@be-fast/i18n";
import { enterUp, fonts, GradientFill, Icon, PressableScale } from "@be-fast/ui-native";
import { colors, gradients, radius, spacing } from "@be-fast/ui-tokens";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import type { CustomerRequest } from "../api";
import { AppText, IconButton, Pill } from "../ui";
import { usePublicQuery } from "./query";
import {
  CatalogButton,
  CatalogImage,
  CatalogNotice,
  Meta,
  catalogStyles,
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
  index,
  onOpen,
}: {
  restaurant: Restaurant;
  mode: BrowseListPage["currencyDisplayMode"];
  index: number;
  onOpen: () => void;
}) {
  const name = restaurant.name ?? text.unnamedRestaurant;
  const fee =
    restaurant.deliveryFeeMinor === 0
      ? text.freeDelivery
      : formatMoney(restaurant.deliveryFeeMinor, mode);
  return (
    <Animated.View entering={enterUp(index)}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={name}
        testID={`catalog-restaurant-${restaurant.id}`}
        onPress={onOpen}
        pressedScale={0.98}
        style={[styles.restaurant, !restaurant.isOrderable && catalogStyles.unavailableCard]}
      >
        <View style={styles.banner}>
          <GradientFill
            from={restaurant.isOrderable ? colors.brandSoft : colors.skeleton}
            to={restaurant.isOrderable ? colors.highlight : colors.subtleBorder}
            id={`banner-${restaurant.id}`}
          />
          <View style={styles.bannerLogo}>
            <CatalogImage
              imageKey={restaurant.logoKey}
              dimmed={!restaurant.isOrderable}
              size={76}
            />
          </View>
          <View style={styles.status}>
            <Pill
              label={restaurant.isOrderable ? text.open : text.closed}
              icon={restaurant.isOrderable ? "bolt" : "clock"}
              tone={restaurant.isOrderable ? "success" : "dark"}
            />
          </View>
        </View>
        <View style={styles.restaurantBody}>
          <AppText variant="title" numberOfLines={1}>
            {name}
          </AppText>
          {restaurant.categories.length > 0 && (
            <AppText variant="small" muted numberOfLines={1}>
              {restaurant.categories.map(({ name }) => name).join(" · ")}
            </AppText>
          )}
          <View style={catalogStyles.meta}>
            <Meta icon="clock" label={`${restaurant.etaMinutes} ${text.minutes}`} />
            <Meta icon="scooter" label={fee} />
            <Meta
              icon="bag"
              label={`${text.minimum} ${formatMoney(restaurant.minOrderMinor, mode)}`}
            />
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

export function BrowseScreen({
  region,
  request,
  selectedAddressLabel,
  onChooseRegion,
  onOpenRestaurant,
  onOpenCart,
  cartCount = 0,
}: {
  region: Region;
  request: CustomerRequest;
  selectedAddressLabel?: string;
  onChooseRegion: () => void;
  onOpenRestaurant: (restaurantId: string) => void;
  onOpenCart: () => void;
  cartCount?: number;
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
      style={catalogStyles.root}
      contentContainerStyle={styles.list}
      data={data}
      initialNumToRender={4}
      windowSize={5}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      keyExtractor={({ id }) => id}
      renderItem={({ item, index }) => (
        <View style={styles.cardSpacing}>
          <RestaurantCard
            restaurant={item}
            mode={mode}
            index={index}
            onOpen={() => onOpenRestaurant(item.id)}
          />
        </View>
      )}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.hero}>
            <GradientFill from={gradients.brand[0]} to={gradients.brand[1]} id="hero" />
            <View style={styles.heroTop}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={text.selectedAddress}
                onPress={onChooseRegion}
                style={styles.address}
              >
                <View style={styles.addressIcon}>
                  <Icon name="pin" size={18} color={colors.onBrand} />
                </View>
                <View style={catalogStyles.flexText}>
                  <AppText variant="caption" tone="onBrand">
                    {text.deliverTo}
                  </AppText>
                  <View style={styles.addressLine}>
                    <AppText weight="bold" tone="onBrand" numberOfLines={1}>
                      {selectedAddressLabel ?? region.neighborhoodName}
                    </AppText>
                    <Icon name="down" size={16} color={colors.onBrand} />
                  </View>
                </View>
              </PressableScale>
              <IconButton
                icon="bag"
                label={text.openCart}
                onPress={onOpenCart}
                badge={cartCount}
              />
            </View>
            <AppText
              variant="display"
              tone="onBrand"
              accessibilityRole="header"
              style={styles.heroTitle}
            >
              {text.browseTitle}
            </AppText>
            <AppText tone="onBrand">
              {text.heroLine}
            </AppText>
            <View style={styles.search}>
              <Icon name="search" size={22} color={colors.mutedInk} />
              <TextInput
                accessibilityLabel={text.search}
                placeholder={text.search}
                placeholderTextColor={colors.mutedInk}
                cursorColor={colors.brandText}
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={searchNow}
                returnKeyType="search"
                style={styles.searchInput}
              />
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={text.applySearch}
                onPress={searchNow}
                style={styles.searchButton}
              >
                <Icon name="forward" size={20} color={colors.onBrand} />
              </PressableScale>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
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
          </ScrollView>

          <View style={styles.sectionHead}>
            <AppText variant="title">{text.nearbyRestaurants}</AppText>
            {data.length > 0 && <Pill label={String(data.length)} tone="brand" />}
          </View>
          <View style={styles.padded}>
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
        </View>
      }
      ListEmptyComponent={
        restaurants.isSuccess ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="store" size={40} color={colors.brandText} strokeWidth={1.6} />
            </View>
            <AppText muted center>
              {text.noRestaurants}
            </AppText>
          </View>
        ) : undefined
      }
      ListFooterComponent={
        restaurants.hasNextPage ? (
          <View style={styles.padded}>
            <CatalogButton
              label={restaurants.isFetchingNextPage ? text.loading : text.more}
              disabled={restaurants.isFetchingNextPage || restaurants.isFetching}
              onPress={() => {
                void restaurants.fetchNextPage();
              }}
            />
          </View>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 120 },
  header: { gap: spacing.lg, marginBottom: spacing.sm },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
    borderBottomLeftRadius: radius.xl + 8,
    borderBottomRightRadius: radius.xl + 8,
    overflow: "hidden",
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  address: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48 },
  addressIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  addressLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  heroTitle: { marginTop: spacing.xs },
  search: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    paddingStart: spacing.md,
    paddingEnd: spacing.xs,
    minHeight: 56,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    fontSize: 16,
    color: colors.ink,
    fontFamily: fonts.regular,
  },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brandStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  sectionHead: {
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  padded: { paddingHorizontal: spacing.lg },
  cardSpacing: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  restaurant: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.subtleBorder,
    overflow: "hidden",
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  banner: { height: 112, alignItems: "flex-start", justifyContent: "flex-end" },
  bannerLogo: {
    marginStart: spacing.lg,
    marginBottom: -30,
    borderRadius: radius.md + 4,
    borderWidth: 4,
    borderColor: colors.panel,
    backgroundColor: colors.panel,
    overflow: "hidden",
  },
  status: { position: "absolute", top: spacing.md, end: spacing.md },
  restaurantBody: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl - 4,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  empty: { alignItems: "center", gap: spacing.md, padding: spacing.xxl },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
});
