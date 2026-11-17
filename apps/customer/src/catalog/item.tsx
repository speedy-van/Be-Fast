import type { PublicRestaurantDetailResponse } from "@be-fast/contracts";
import {
  calcItemTotal,
  formatMoney,
  validateMenuOptions,
  type DisplayMode,
} from "@be-fast/domain";
import { customerCatalog as text, messages } from "@be-fast/i18n";
import { enterUp, GradientFill, Icon, PopOnChange, PressableScale } from "@be-fast/ui-native";
import { colors, radius, spacing } from "@be-fast/ui-tokens";
import { impactAsync, ImpactFeedbackStyle } from "expo-haptics";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { AppText, Field, IconButton, Pill } from "../ui";
import { CatalogImage, catalogStyles } from "./shared";
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

function StepButton({
  testID,
  label,
  icon,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  icon: "plus" | "minus";
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      pressedScale={0.88}
      style={[styles.step, disabled && catalogStyles.disabled]}
    >
      <Icon name={icon} size={20} color={colors.ink} strokeWidth={2.4} />
    </PressableScale>
  );
}

export function QuantityControls({
  quantity,
  onChange,
  compact = false,
}: {
  quantity: number;
  onChange: (quantity: number) => void;
  compact?: boolean;
}) {
  return (
    <View
      style={[styles.stepper, compact && styles.stepperCompact]}
      accessibilityLabel={text.quantity}
    >
      <StepButton
        testID="quantity-plus"
        label={text.increase}
        icon="plus"
        disabled={quantity >= 50}
        onPress={() => onChange(Math.min(50, quantity + 1))}
      />
      <PopOnChange value={quantity} style={styles.count}>
        <AppText weight="bold" variant="title" center>
          {quantity}
        </AppText>
      </PopOnChange>
      <StepButton
        testID="quantity-minus"
        label={text.decrease}
        icon="minus"
        disabled={quantity <= 1}
        onPress={() => onChange(Math.max(1, quantity - 1))}
      />
    </View>
  );
}

function ChoiceRow({
  testID,
  label,
  price,
  selected,
  disabled,
  single,
  onPress,
}: {
  testID: string;
  label: string;
  price?: string;
  selected: boolean;
  disabled: boolean;
  single: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole={single ? "radio" : "checkbox"}
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      pressedScale={0.98}
      style={[styles.choice, selected && styles.choiceSelected, disabled && catalogStyles.disabled]}
    >
      <View
        style={[
          single ? styles.radio : styles.checkbox,
          selected && styles.indicatorOn,
        ]}
      >
        {selected &&
          (single ? (
            <View style={styles.radioDot} />
          ) : (
            <Icon name="check" size={14} color={colors.onBrand} strokeWidth={3} />
          ))}
      </View>
      <AppText weight={selected ? "semibold" : "regular"} style={catalogStyles.flexText}>
        {label}
      </AppText>
      {price && (
        <AppText variant="small" muted={!selected} tone={selected ? "brand" : undefined} style={styles.numeric}>
          {price}
        </AppText>
      )}
    </PressableScale>
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
    void Promise.resolve(impactAsync(ImpactFeedbackStyle.Medium)).catch(
      () => undefined,
    );
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

  const showSizes =
    item.sizes.length > 1 || (size && size.name !== messages.menu.regularSize);
  let section = 0;

  return (
    <View style={catalogStyles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <CatalogImage imageKey={item.imageKey} cover fill />
          <View style={styles.heroActions}>
            <IconButton icon="close" label={text.back} onPress={onBack} tone="glass" />
          </View>
        </View>
        <View style={styles.sheet}>
          <Animated.View entering={enterUp(section++)} style={styles.titleBlock}>
            <AppText variant="headline" accessibilityRole="header">
              {item.name}
            </AppText>
            {item.description && <AppText muted>{item.description}</AppText>}
            {(!available || !item.isAvailable) && (
              <Pill label={text.unavailable} icon="clock" tone="dark" />
            )}
          </Animated.View>

          {showSizes && (
            <Animated.View entering={enterUp(section++)} style={styles.group}>
              <View style={styles.groupHead}>
                <AppText variant="title" style={catalogStyles.flexText}>
                  {text.size}
                </AppText>
                <Pill label={text.required} tone="brand" />
              </View>
              {item.sizes.map((candidate) => (
                <ChoiceRow
                  key={candidate.id}
                  testID={`size-${candidate.id}`}
                  label={candidate.name}
                  price={formatMoney(candidate.priceMinor, mode)}
                  selected={candidate.id === sizeId}
                  disabled={false}
                  single
                  onPress={() => setSize(candidate.id)}
                />
              ))}
            </Animated.View>
          )}

          {item.optionGroups.map((group) => {
            const selectionCount = group.options.filter(({ id }) =>
              optionIds.includes(id),
            ).length;
            const single = group.maxSelect === 1;
            return (
              <Animated.View key={group.id} entering={enterUp(section++)} style={styles.group}>
                <View style={styles.groupHead}>
                  <View style={catalogStyles.flexText}>
                    <AppText variant="title">{group.name}</AppText>
                    <AppText variant="small" muted>
                      {single
                        ? text.chooseOne
                        : `${text.chooseUpTo} ${group.maxSelect}`}
                      {group.minSelect > 1 ? ` · ${text.minimumOptions} ${group.minSelect}` : ""}
                    </AppText>
                  </View>
                  <Pill
                    label={group.minSelect > 0 ? text.requiredOptions : text.optionalOptions}
                    tone={group.minSelect > 0 ? "brand" : "neutral"}
                  />
                </View>
                {group.options.map((option) => {
                  const selected = optionIds.includes(option.id);
                  const disabled =
                    !option.isAvailable ||
                    group.maxSelect === 0 ||
                    (group.maxSelect > 1 &&
                      !selected &&
                      selectionCount >= group.maxSelect);
                  return (
                    <ChoiceRow
                      key={option.id}
                      testID={`option-${option.id}`}
                      label={option.name}
                      price={
                        option.priceMinor > 0
                          ? `+ ${formatMoney(option.priceMinor, mode)}`
                          : undefined
                      }
                      selected={selected}
                      disabled={disabled}
                      single={single}
                      onPress={() => toggle(group, option.id)}
                    />
                  );
                })}
              </Animated.View>
            );
          })}

          <Animated.View entering={enterUp(section++)}>
            <Field
              label={text.specialInstructions}
              icon="note"
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={200}
            />
          </Animated.View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <QuantityControls quantity={quantity} onChange={setQuantity} />
        <PressableScale
          testID="customer-add-to-cart"
          accessibilityRole="button"
          accessibilityLabel={text.addToCart}
          accessibilityState={{ disabled: !canAdd }}
          disabled={!canAdd}
          onPress={add}
          style={[styles.add, !canAdd && styles.addDisabled]}
        >
          {canAdd && <GradientFill from={colors.brandStrong} to={colors.brandDeep} id="add" />}
          <AppText weight="bold" tone="onBrand">
            {text.addToCart}
          </AppText>
          <AppText
            testID="customer-item-price"
            weight="bold"
            variant="small"
            tone="onBrand"
            style={styles.numeric}
            numberOfLines={1}
          >
            {totalMinor === undefined
              ? text.priceUnavailable
              : formatMoney(totalMinor, mode)}
          </AppText>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 140 },
  hero: { height: 280 },
  heroActions: { position: "absolute", top: spacing.md, start: spacing.lg },
  sheet: {
    marginTop: -28,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    padding: spacing.lg,
    gap: spacing.xl,
  },
  titleBlock: { gap: spacing.sm },
  group: {
    gap: spacing.sm,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.subtleBorder,
  },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  choice: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.transparent,
  },
  choiceSelected: { backgroundColor: colors.brandTint, borderColor: colors.brandSoft },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  indicatorOn: { borderColor: colors.brandStrong, backgroundColor: colors.brandStrong },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.onBrand },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.subtleBorder,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  stepperCompact: { alignSelf: "flex-start" },
  step: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  count: { minWidth: 32, alignItems: "center" },
  footer: {
    position: "absolute",
    start: 0,
    end: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.subtleBorder,
    elevation: 14,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
  },
  add: {
    flex: 1,
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.brandStrong,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: spacing.md,
  },
  addDisabled: { backgroundColor: colors.border, opacity: 0.6 },
  numeric: { writingDirection: "ltr" },
});
