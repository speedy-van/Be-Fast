import { calcItemTotal, calcOrderTotals, formatMoney } from "@be-fast/domain";
import { customerCatalog as text, messages } from "@be-fast/i18n";
import { enterUp, Icon } from "@be-fast/ui-native";
import { colors, radius, spacing } from "@be-fast/ui-tokens";
import { StyleSheet, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import {
  AppText,
  Button,
  Card,
  EmptyState,
  IconButton,
  InfoRow,
  ScreenHeader,
  ScrollScreen,
} from "../ui";
import { QuantityControls } from "./item";
import type { Cart, CartLine } from "./types";

function lineTotal(line: CartLine) {
  try {
    return calcItemTotal(
      line.sizePriceMinor,
      line.optionPricesMinor,
      line.quantity,
    );
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return undefined;
  }
}

export function foodSubtotal(lines: readonly CartLine[]) {
  const lineTotals = lines.map(lineTotal);
  if (lineTotals.some((total) => total === undefined)) return undefined;
  try {
    return calcOrderTotals(
      lineTotals.filter((total) => total !== undefined),
      0,
      0,
    ).foodSubtotalMinor;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return undefined;
  }
}

export function CartScreen({
  cart,
  onChangeCart,
  onBrowse,
  onCheckout,
  checkoutLocked = false,
}: {
  cart: Cart | null;
  onChangeCart: (cart: Cart | null) => void;
  onBrowse: () => void;
  onCheckout: () => void;
  checkoutLocked?: boolean;
}) {
  const mode = cart?.currencyDisplayMode ?? "OLD";
  const subtotal = foodSubtotal(cart?.items ?? []);
  const count = cart?.items.reduce((sum, line) => sum + line.quantity, 0) ?? 0;

  function changeLine(key: string, quantity?: number) {
    if (!cart || checkoutLocked) return;
    const items = cart.items.flatMap((line) =>
      line.key !== key
        ? [line]
        : quantity === undefined
          ? []
          : [{ ...line, quantity }],
    );
    onChangeCart(items.length ? { ...cart, items } : null);
  }

  if (!cart || cart.items.length === 0)
    return (
      <ScrollScreen>
        <ScreenHeader title={text.cartTitle} />
        <EmptyState
          icon="bag"
          title={text.emptyCart}
          message={text.emptyCartHint}
          action={<Button label={text.browse} onPress={onBrowse} primary icon="store" />}
        />
      </ScrollScreen>
    );

  const belowMinimum = subtotal !== undefined && subtotal < cart.minOrderMinor;
  return (
    <ScrollScreen
      footer={
        <>
          <InfoRow
            label={text.subtotal}
            value={
              subtotal === undefined
                ? text.priceUnavailable
                : formatMoney(subtotal, mode)
            }
            strong
          />
          <Button
            label={text.continueToCheckout}
            primary
            icon="forward"
            disabled={subtotal === undefined}
            onPress={onCheckout}
          />
        </>
      }
    >
      <ScreenHeader
        title={text.cartTitle}
        subtitle={`${cart.restaurantName} · ${count} ${text.itemsCount}`}
      />
      {cart.items.map((line, index) => {
        const price = lineTotal(line);
        return (
          <Animated.View
            key={line.key}
            entering={enterUp(index)}
            layout={LinearTransition.springify().damping(18)}
          >
            <Card style={styles.line}>
              <View style={styles.lineTop}>
                <View style={styles.flex}>
                  <AppText variant="title">{line.name}</AppText>
                  {line.sizeName !== messages.menu.regularSize && (
                    <AppText variant="small" muted>
                      {line.sizeName}
                    </AppText>
                  )}
                  {line.optionNames.length > 0 && (
                    <AppText variant="small" muted>
                      {line.optionNames.join(" · ")}
                    </AppText>
                  )}
                  {line.note && (
                    <View style={styles.note}>
                      <Icon name="note" size={14} color={colors.mutedInk} />
                      <AppText variant="small" muted style={styles.flex}>
                        {line.note}
                      </AppText>
                    </View>
                  )}
                </View>
                {!checkoutLocked && (
                  <IconButton
                    icon="trash"
                    label={text.remove}
                    onPress={() => changeLine(line.key)}
                  />
                )}
              </View>
              <View style={styles.lineBottom}>
                {!checkoutLocked ? (
                  <QuantityControls
                    compact
                    quantity={line.quantity}
                    onChange={(quantity) => changeLine(line.key, quantity)}
                  />
                ) : (
                  <AppText muted>× {line.quantity}</AppText>
                )}
                <AppText weight="bold" tone="brand" style={styles.numeric}>
                  {price === undefined
                    ? text.priceUnavailable
                    : formatMoney(price, mode)}
                </AppText>
              </View>
            </Card>
          </Animated.View>
        );
      })}
      {belowMinimum && (
        <Card tone="warning">
          <View style={styles.note}>
            <Icon name="info" size={20} color={colors.warning} />
            <AppText tone="warning" style={styles.flex}>
              {text.minimum} {formatMoney(cart.minOrderMinor, mode)}
            </AppText>
          </View>
        </Card>
      )}
      <Button label={text.addMore} onPress={onBrowse} variant="soft" icon="plus" />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  line: { gap: spacing.md },
  lineTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  lineBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.subtleBorder,
    paddingTop: spacing.md,
    borderRadius: radius.sm,
  },
  note: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  numeric: { writingDirection: "ltr" },
});
