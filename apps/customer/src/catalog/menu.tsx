import { ApiClientError } from "@be-fast/api-client";
import {
  publicRestaurantDetailResponseSchema,
  type PublicRestaurantDetailResponse,
} from "@be-fast/contracts";
import { formatMoney } from "@be-fast/domain";
import { customerCatalog as text } from "@be-fast/i18n";
import { useQuery } from "@tanstack/react-query";
import { Pressable, SectionList, View } from "react-native";
import type { CustomerRequest } from "../api";
import { AppText } from "../ui";
import type { CatalogItem } from "./item";
import { publicQueryOptions } from "./query";
import {
  CatalogButton,
  CatalogImage,
  CatalogNotice,
  catalogStyles as styles,
} from "./shared";

export function useRestaurantMenu(
  restaurantId: string,
  neighborhoodId: string,
  request: CustomerRequest,
) {
  const read = publicQueryOptions(
    `/public/restaurants/${restaurantId}?neighborhoodId=${encodeURIComponent(neighborhoodId)}`,
    publicRestaurantDetailResponseSchema,
    request,
  );
  return useQuery({
    ...read,
    queryFn: async (context) => {
      try {
        return await read.queryFn(context);
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404)
          return null;
        throw error;
      }
    },
  });
}

function MenuItemCard({
  item,
  mode,
  onOpen,
}: {
  item: CatalogItem;
  mode: PublicRestaurantDetailResponse["currencyDisplayMode"];
  onOpen: () => void;
}) {
  const startingPrice = item.sizes.reduce<number | undefined>(
    (min, { priceMinor }) =>
      min === undefined ? priceMinor : Math.min(min, priceMinor),
    undefined,
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.name}
      onPress={onOpen}
      style={[styles.card, !item.isAvailable && styles.unavailableCard]}
    >
      <View style={styles.spread}>
        <View style={[styles.stack, styles.flexText]}>
          <AppText title style={styles.heading}>
            {item.name}
          </AppText>
          {item.description && <AppText muted>{item.description}</AppText>}
          {!item.isAvailable && <AppText muted>{text.unavailable}</AppText>}
          {startingPrice !== undefined && (
            <AppText>
              {item.sizes.length > 1 ? `${text.startsAt} ` : ""}
              {formatMoney(startingPrice, mode)}
            </AppText>
          )}
        </View>
        <CatalogImage imageKey={item.imageKey} dimmed={!item.isAvailable} />
      </View>
    </Pressable>
  );
}

export function MenuList({
  menu,
  onBack,
  onOpenCart,
  onOpenItem,
}: {
  menu: ReturnType<typeof useRestaurantMenu>;
  onBack: () => void;
  onOpenCart: () => void;
  onOpenItem: (id: string) => void;
}) {
  const restaurant = menu.data;
  const sections =
    restaurant?.sections.map(({ id, name, items }) => ({
      key: id,
      name,
      data: items,
    })) ?? [];
  const mode = restaurant?.currencyDisplayMode ?? "OLD";
  return (
    <SectionList
      style={styles.root}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={({ id }) => id}
      initialNumToRender={5}
      windowSize={5}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.stack}>
          <View style={styles.row}>
            <CatalogButton label={text.back} onPress={onBack} />
            <CatalogButton label={text.openCart} onPress={onOpenCart} />
          </View>
          <CatalogNotice
            loading={menu.isPending}
            error={
              menu.isError || (menu.dataUpdatedAt > 0 && menu.failureCount > 0)
            }
            dataUpdatedAt={menu.dataUpdatedAt}
            retry={() => {
              void menu.refetch();
            }}
          />
          {restaurant && (
            <>
              <CatalogImage imageKey={restaurant.coverImageKey} cover />
              <AppText title accessibilityRole="header">
                {restaurant.name ?? text.unnamedRestaurant}
              </AppText>
              <AppText>
                {restaurant.isOrderable ? text.available : text.closed}
              </AppText>
              <AppText muted>
                {text.delivery} {formatMoney(restaurant.deliveryFeeMinor, mode)}{" "}
                · {text.minimum} {formatMoney(restaurant.minOrderMinor, mode)}
              </AppText>
              <AppText muted>
                {text.deliveryTime} {restaurant.etaMinutes} {text.minutes}
              </AppText>
            </>
          )}
        </View>
      }
      ListEmptyComponent={
        menu.isSuccess ? <AppText muted>{text.noMenu}</AppText> : undefined
      }
      renderSectionHeader={({ section }) => (
        <AppText title style={styles.heading}>
          {section.name}
        </AppText>
      )}
      renderItem={({ item }) => (
        <MenuItemCard
          item={item}
          mode={mode}
          onOpen={() => onOpenItem(item.id)}
        />
      )}
    />
  );
}
