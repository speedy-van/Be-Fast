import type { PublicRestaurantDetailResponse } from "@be-fast/contracts";
import {
  calcItemTotal,
  formatMoney,
  validateMenuOptions,
  type DisplayMode,
} from "@be-fast/domain";
import { customerCatalog as text, messages } from "@be-fast/i18n";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { AppText, Field } from "../ui";
import { CatalogButton, CatalogImage, catalogStyles as styles } from "./shared";
import type { CartLine } from "./types";

export type CatalogItem =
  PublicRestaurantDetailResponse["sections"][number]["items"][number];
export type ItemSelection = Omit<CartLine, "key">;
type OptionGroup = CatalogItem["optionGroups"][number];

function itemPrice(
  baseMinor: number | undefined,
  optionPricesMinor: number[],
  quantity: number,
) {
  if (baseMinor === undefined) return undefined;
  try {
    return calcItemTotal(baseMinor, optionPricesMinor, quantity);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return undefined;
  }
}

export function QuantityControls({
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (quantity: number) => void;
}) {
  return (
    <View style={styles.spread}>
      <AppText>{text.quantity}</AppText>
      <View style={styles.row}>
        <CatalogButton
          testID="quantity-minus"
          label={text.decrease}
          disabled={quantity <= 1}
          onPress={() => onChange(Math.max(1, quantity - 1))}
        />
        <AppText>{quantity}</AppText>
        <CatalogButton
          testID="quantity-plus"
          label={text.increase}
          disabled={quantity >= 50}
          onPress={() => onChange(Math.min(50, quantity + 1))}
        />
      </View>
    </View>
  );
}

export function ItemCustomizer({
  item,
  mode,
  available,
  onAdd,
  onBack,
}: {
  item: CatalogItem;
  mode: DisplayMode;
  available: boolean;
  onAdd: (line: ItemSelection) => void;
  onBack: () => void;
}) {
  const [sizeId, setSize] = useState(item.sizes[0]?.id);
  const [optionIds, setOptions] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const size = item.sizes.find(({ id }) => id === sizeId);
  const selectedOptions = item.optionGroups.flatMap((group) =>
    group.options.filter(({ id }) => optionIds.includes(id)),
  );
  const optionPricesMinor = selectedOptions.map(({ priceMinor }) => priceMinor);
  const totalMinor = itemPrice(size?.priceMinor, optionPricesMinor, quantity);
  const canAdd =
    available &&
    item.isAvailable &&
    size !== undefined &&
    totalMinor !== undefined &&
    validateMenuOptions(item.optionGroups, optionIds);

  function toggle(group: OptionGroup, id: string) {
    if (
      group.maxSelect === 0 ||
      !group.options.some((option) => option.id === id && option.isAvailable)
    )
      return;
    setOptions((previous) => {
      if (previous.includes(id))
        return previous.filter((value) => value !== id);
      const groupIds = new Set(group.options.map((option) => option.id));
      if (group.maxSelect === 1)
        return [...previous.filter((value) => !groupIds.has(value)), id];
      if (
        previous.filter((value) => groupIds.has(value)).length >=
        group.maxSelect
      )
        return previous;
      return [...previous, id];
    });
  }

  function add() {
    if (!canAdd || !size) return;
    onAdd({
      menuItemId: item.id,
      sizeId: size.id,
      optionIds: selectedOptions.map(({ id }) => id),
      quantity,
      note: note.trim() || undefined,
      name: item.name,
      sizeName: size.name,
      optionNames: selectedOptions.map(({ name }) => name),
      sizePriceMinor: size.priceMinor,
      optionPricesMinor,
    });
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <CatalogButton label={text.back} onPress={onBack} />
      <CatalogImage imageKey={item.imageKey} cover />
      <AppText title accessibilityRole="header">
        {item.name}
      </AppText>
      {item.description && <AppText>{item.description}</AppText>}
      {(!available || !item.isAvailable) && (
        <AppText muted>{text.unavailable}</AppText>
      )}
      {(item.sizes.length > 1 ||
        (size && size.name !== messages.menu.regularSize)) && (
        <View style={styles.card}>
          <AppText title style={styles.heading}>
            {text.size}
          </AppText>
          <View style={styles.row}>
            {item.sizes.map((candidate) => (
              <CatalogButton
                key={candidate.id}
                testID={`size-${candidate.id}`}
                label={`${candidate.name} · ${formatMoney(candidate.priceMinor, mode)}`}
                selected={candidate.id === sizeId}
                onPress={() => setSize(candidate.id)}
              />
            ))}
          </View>
        </View>
      )}
      {item.optionGroups.map((group) => {
        const selectionCount = group.options.filter(({ id }) =>
          optionIds.includes(id),
        ).length;
        return (
          <View key={group.id} style={styles.card}>
            <AppText title style={styles.heading}>
              {group.name}
            </AppText>
            <AppText muted>
              {group.minSelect > 0
                ? text.requiredOptions
                : text.optionalOptions}{" "}
              · {text.minimumOptions} {group.minSelect} · {text.maximumOptions}{" "}
              {group.maxSelect}
            </AppText>
            <View style={styles.row}>
              {group.options.map((option) => {
                const selected = optionIds.includes(option.id);
                const disabled =
                  !option.isAvailable ||
                  group.maxSelect === 0 ||
                  (group.maxSelect > 1 &&
                    !selected &&
                    selectionCount >= group.maxSelect);
                return (
                  <CatalogButton
                    key={option.id}
                    testID={`option-${option.id}`}
                    label={`${option.name} · ${formatMoney(option.priceMinor, mode)}`}
                    selected={selected}
                    disabled={disabled}
                    onPress={() => toggle(group, option.id)}
                  />
                );
              })}
            </View>
          </View>
        );
      })}
      <Field
        label={text.specialInstructions}
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={200}
      />
      <QuantityControls quantity={quantity} onChange={setQuantity} />
      <View style={styles.spread}>
        <AppText>{text.price}</AppText>
        <AppText testID="customer-item-price" style={styles.amount}>
          {totalMinor === undefined
            ? text.priceUnavailable
            : formatMoney(totalMinor, mode)}
        </AppText>
      </View>
      <CatalogButton
        testID="customer-add-to-cart"
        label={text.addToCart}
        primary
        disabled={!canAdd}
        onPress={add}
      />
    </ScrollView>
  );
}
