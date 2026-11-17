import { calcItemTotal, calcOrderTotals, formatMoney } from "@be-fast/domain";
import { customerCatalog as text, messages } from "@be-fast/i18n";
import { ScrollView, View } from "react-native";
import { AppText } from "../ui";
import { QuantityControls } from "./item";
import { CatalogButton, catalogStyles as styles } from "./shared";
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

function foodSubtotal(lines: readonly CartLine[]) {
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

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <AppText title accessibilityRole="header">
        {text.cartTitle}
      </AppText>
      {cart && cart.items.length > 0 ? (
        <>
          <AppText muted>{cart.restaurantName}</AppText>
          {cart.items.map((line) => {
            const price = lineTotal(line);
            return (
              <View key={line.key} style={styles.card}>
                <AppText title style={styles.heading}>
                  {line.name}
                </AppText>
                {line.sizeName !== messages.menu.regularSize && (
                  <AppText muted>{line.sizeName}</AppText>
                )}
                {line.optionNames.length > 0 && (
                  <AppText muted>{line.optionNames.join(" · ")}</AppText>
                )}
                {line.note && <AppText>{line.note}</AppText>}
                <AppText>
                  {price === undefined
                    ? text.priceUnavailable
                    : formatMoney(price, mode)}
                </AppText>
                {!checkoutLocked && (
                  <>
                    <QuantityControls
                      quantity={line.quantity}
                      onChange={(quantity) => changeLine(line.key, quantity)}
                    />
                    <CatalogButton
                      label={text.remove}
                      onPress={() => changeLine(line.key)}
                    />
                  </>
                )}
              </View>
            );
          })}
          <View style={styles.spread}>
            <AppText>{text.subtotal}</AppText>
            <AppText style={styles.amount}>
              {subtotal === undefined
                ? text.priceUnavailable
                : formatMoney(subtotal, mode)}
            </AppText>
          </View>
          <CatalogButton
            label={text.continueToCheckout}
            primary
            disabled={subtotal === undefined}
            onPress={onCheckout}
          />
        </>
      ) : (
        <AppText muted>{text.emptyCart}</AppText>
      )}
      <CatalogButton label={text.browse} onPress={onBrowse} />
    </ScrollView>
  );
}
