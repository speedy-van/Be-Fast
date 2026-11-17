import { ApiClientError } from "@be-fast/api-client";
import {
  publicRestaurantDetailResponseSchema,
  type PublicRestaurantDetailResponse,
} from "@be-fast/contracts";
import { formatMoney } from "@be-fast/domain";
import { customerCatalog as text } from "@be-fast/i18n";
import { enterUp, Icon, PressableScale } from "@be-fast/ui-native";
import { colors, radius, spacing } from "@be-fast/ui-tokens";
import { useQuery } from "@tanstack/react-query";
import { SectionList, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import type { CustomerRequest } from "../api";
import { AppText, IconButton, Pill } from "../ui";
import type { CatalogItem } from "./item";
import { publicQueryOptions } from "./query";
import {
  CatalogImage,
  CatalogNotice,
  catalogStyles,
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
  index,
  onOpen,
}: {
  item: CatalogItem;
  mode: PublicRestaurantDetailResponse["currencyDisplayMode"];
  index: number;
  onOpen: () => void;
}) {
  const startingPrice = item.sizes.reduce<number | undefined>(
    (min, { priceMinor }) =>
      min === undefined ? priceMinor : Math.min(min, priceMinor),
    undefined,
  );
  return (
    <Animated.View entering={enterUp(index)} style={styles.itemSpacing}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={item.name}
        onPress={onOpen}
        pressedScale={0.98}
        style={[styles.item, !item.isAvailable && catalogStyles.unavailableCard]}
      >
        <View style={styles.itemText}>
          <AppText variant="title" numberOfLines={2}>
            {item.name}
          </AppText>
          {item.description && (
            <AppText variant="small" muted numberOfLines={2}>
              {item.description}
            </AppText>
          )}
          {!item.isAvailable && <Pill label={text.unavailable} tone="neutral" />}
          {startingPrice !== undefined && (
            <AppText weight="bold" tone="brand" style={styles.price}>
              {item.sizes.length > 1 ? `${text.startsAt} ` : ""}
              {formatMoney(startingPrice, mode)}
            </AppText>
          )}
        </View>
        <View>
          <CatalogImage imageKey={item.imageKey} dimmed={!item.isAvailable} size={104} />
          {item.isAvailable && (
            <View style={styles.addBadge}>
              <Icon name="plus" size={18} color={colors.onBrand} strokeWidth={2.6} />
            </View>
          )}
        </View>
      </PressableScale>
    </Animated.View>
  );
}

export interface CartSummary {
  count: number;
  label: string;
}

/** Floating "view cart" bar shown while the cart has items. */
export function CartBar({
  summary,
  onPress,
}: {
  summary: CartSummary;
  onPress: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} style={styles.cartBarWrap}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={text.viewCart}
        onPress={onPress}
        style={styles.cartBar}
      >
        <View style={styles.cartCount}>
          <AppText weight="bold" tone="brand">
            {summary.count}
          </AppText>
        </View>
        <AppText weight="bold" tone="onBrand" style={catalogStyles.flexText}>
          {text.viewCart}
        </AppText>
        <AppText weight="bold" tone="onBrand" style={styles.numeric}>
          {summary.label}
        </AppText>
        <Icon name="forward" size={20} color={colors.onBrand} />
      </PressableScale>
    </Animated.View>
  );
}

export function MenuList({
  menu,
  onBack,
  onOpenCart,
  onOpenItem,
  cartSummary,
}: {
  menu: ReturnType<typeof useRestaurantMenu>;
  onBack: () => void;
  onOpenCart: () => void;
  onOpenItem: (id: string) => void;
  cartSummary?: CartSummary | null;
}) {
  const restaurant = menu.data;
  const sections =
    restaurant?.sections.map(({ id, name, items }) => ({
      key: id,
      name,
      data: items,
    })) ?? [];
  const mode = restaurant?.currencyDisplayMode ?? "OLD";
  const fee = restaurant
    ? restaurant.deliveryFeeMinor === 0
      ? text.freeDelivery
      : formatMoney(restaurant.deliveryFeeMinor, mode)
    : "";
  return (
    <View style={catalogStyles.root}>
      <SectionList
        style={catalogStyles.root}
        contentContainerStyle={styles.list}
        sections={sections}
        keyExtractor={({ id }) => id}
        initialNumToRender={6}
        windowSize={5}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.cover}>
              <CatalogImage imageKey={restaurant?.coverImageKey ?? null} cover fill />
              <View style={styles.coverActions}>
                <IconButton icon="back" label={text.back} onPress={onBack} tone="glass" />
                <IconButton
                  icon="bag"
                  label={text.openCart}
                  onPress={onOpenCart}
                  tone="glass"
                  badge={cartSummary?.count}
                />
              </View>
            </View>
            {restaurant && (
              <Animated.View entering={enterUp(0)} style={styles.info}>
                <View style={styles.infoTop}>
                  <View style={styles.logo}>
                    <CatalogImage imageKey={restaurant.logoKey} size={64} />
                  </View>
                  <View style={catalogStyles.flexText}>
                    <AppText variant="headline" accessibilityRole="header" numberOfLines={2}>
                      {restaurant.name ?? text.unnamedRestaurant}
                    </AppText>
                    <Pill
                      label={restaurant.isOrderable ? text.available : text.closed}
                      icon={restaurant.isOrderable ? "bolt" : "clock"}
                      tone={restaurant.isOrderable ? "success" : "dark"}
                    />
                  </View>
                </View>
                <View style={styles.stats}>
                  <Stat icon="clock" value={`${restaurant.etaMinutes} ${text.minutes}`} label={text.deliveryTime} />
                  <View style={styles.statDivider} />
                  <Stat icon="scooter" value={fee} label={text.deliveryFee} />
                  <View style={styles.statDivider} />
                  <Stat
                    icon="bag"
                    value={formatMoney(restaurant.minOrderMinor, mode)}
                    label={text.minimum}
                  />
                </View>
              </Animated.View>
            )}
            <View style={styles.padded}>
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
            </View>
          </View>
        }
        ListEmptyComponent={
          menu.isSuccess ? (
            <View style={styles.padded}>
              <AppText muted center>
                {text.noMenu}
              </AppText>
            </View>
          ) : undefined
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <View style={styles.sectionMark} />
            <AppText variant="title" accessibilityRole="header">
              {section.name}
            </AppText>
          </View>
        )}
        renderItem={({ item, index }) => (
          <MenuItemCard
            item={item}
            mode={mode}
            index={index}
            onOpen={() => onOpenItem(item.id)}
          />
        )}
      />
      {cartSummary && cartSummary.count > 0 && (
        <CartBar summary={cartSummary} onPress={onOpenCart} />
      )}
    </View>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: "clock" | "scooter" | "bag";
  value: string;
  label: string;
}) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={20} color={colors.brandText} />
      <AppText weight="bold" variant="small" numberOfLines={1} center>
        {value}
      </AppText>
      <AppText variant="caption" muted numberOfLines={1} center>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 140 },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  cover: { height: 230 },
  coverActions: {
    position: "absolute",
    top: spacing.md,
    start: spacing.lg,
    end: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  info: {
    marginTop: -56,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.panel,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  infoTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  logo: {
    borderRadius: radius.md + 2,
    borderWidth: 2,
    borderColor: colors.subtleBorder,
    overflow: "hidden",
  },
  stats: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  stat: { flex: 1, alignItems: "center", gap: 2, paddingHorizontal: spacing.xs },
  statDivider: { width: 1, backgroundColor: colors.subtleBorder },
  padded: { paddingHorizontal: spacing.lg },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionMark: {
    width: 5,
    height: 22,
    borderRadius: 3,
    backgroundColor: colors.brandText,
  },
  itemSpacing: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.subtleBorder,
    padding: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  itemText: { flex: 1, gap: spacing.xs },
  price: { marginTop: spacing.xs },
  addBadge: {
    position: "absolute",
    bottom: -6,
    start: -6,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.brandStrong,
    borderWidth: 3,
    borderColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBarWrap: {
    position: "absolute",
    start: spacing.lg,
    end: spacing.lg,
    bottom: spacing.lg,
  },
  cartBar: {
    minHeight: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.brandStrong,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  cartCount: {
    minWidth: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  numeric: { writingDirection: "ltr" },
});
