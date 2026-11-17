import { restaurantApp as text } from "@be-fast/i18n";
import {
  fonts,
  GradientFill,
  Icon,
  PressableScale,
  type IconName,
} from "@be-fast/ui-native";
import { darkColors as colors, fontSize, radius, spacing } from "@be-fast/ui-tokens";
import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
} from "react-native";

export const nativeFont = fonts;

export function AppText({
  title,
  muted,
  style,
  ...props
}: TextProps & { title?: boolean; muted?: boolean }) {
  return (
    <Text
      {...props}
      style={[styles.text, title && styles.title, muted && styles.muted, style]}
    />
  );
}

export function Button({
  label,
  onPress,
  disabled,
  primary,
  icon,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  icon?: IconName;
  danger?: boolean;
}) {
  const foreground = primary ? colors.onBrand : danger ? colors.danger : colors.ink;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        primary && styles.primary,
        danger && styles.danger,
        disabled && styles.disabled,
      ]}
    >
      {primary && (
        <GradientFill from={colors.brandStrong} to={colors.brandDeep} id="rbutton" />
      )}
      {icon && <Icon name={icon} size={20} color={foreground} />}
      <AppText style={[styles.buttonText, { color: foreground }]}>{label}</AppText>
    </PressableScale>
  );
}

export function Field({
  label,
  style,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <AppText style={styles.label}>{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.mutedInk}
        cursorColor={colors.brandText}
        selectionColor={colors.brandSoft}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[styles.input, focused && styles.inputFocused, style]}
      />
    </View>
  );
}

export function Choices<T extends string>({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: readonly { id: T; label: string }[];
  selected?: T;
  onSelect: (id: T) => void;
}) {
  return (
    <View style={styles.field} accessibilityLabel={label}>
      <AppText style={styles.label}>{label}</AppText>
      <View style={styles.row}>
        {values.map((option) => {
          const active = selected === option.id;
          return (
            <PressableScale
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(option.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              {active && <Icon name="check" size={16} color={colors.brandText} strokeWidth={2.6} />}
              <AppText style={active ? styles.chipTextActive : undefined}>
                {option.label}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

export function ScrollScreen({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function Status({
  busy,
  message,
  error,
  retry,
}: {
  busy?: boolean;
  message?: string;
  error?: string;
  retry?: () => void;
}) {
  return (
    <View style={styles.field}>
      {busy && (
        <ActivityIndicator
          accessibilityLabel={text.loading}
          color={colors.brandText}
          size="large"
        />
      )}
      {message && (
        <View style={[styles.notice, styles.noticeInfo]}>
          <Icon name="info" size={20} color={colors.info} />
          <AppText accessibilityLiveRegion="polite" style={styles.flex}>
            {message}
          </AppText>
        </View>
      )}
      {error && (
        <View style={[styles.notice, styles.noticeError]}>
          <Icon name="alert" size={20} color={colors.danger} />
          <AppText accessibilityRole="alert" style={[styles.error, styles.flex]}>
            {error}
          </AppText>
        </View>
      )}
      {error && retry && <Button label={text.retry} onPress={retry} icon="refresh" />}
    </View>
  );
}

export const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.subtleBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  text: {
    color: colors.ink,
    fontSize: fontSize.body,
    lineHeight: 24,
    fontFamily: fonts.regular,
  },
  title: { fontSize: fontSize.title, lineHeight: 32, fontFamily: fonts.bold },
  label: { fontFamily: fonts.semibold, fontSize: fontSize.small, color: colors.mutedInk },
  muted: { color: colors.mutedInk },
  field: { gap: spacing.sm },
  error: { color: colors.danger, fontFamily: fonts.semibold },
  button: {
    minHeight: 52,
    minWidth: 48,
    borderRadius: radius.md,
    borderColor: colors.subtleBorder,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.raised,
    overflow: "hidden",
  },
  buttonText: { fontFamily: fonts.bold },
  primary: { borderColor: colors.transparent },
  danger: { backgroundColor: colors.dangerSoft, borderColor: colors.transparent },
  pressed: { backgroundColor: colors.highlight },
  disabled: { opacity: 0.45 },
  input: {
    minHeight: 52,
    borderColor: colors.subtleBorder,
    borderWidth: 1.5,
    borderRadius: radius.md,
    color: colors.ink,
    fontSize: fontSize.body,
    fontFamily: fonts.regular,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.raised,
  },
  inputFocused: { borderColor: colors.brandText },
  chip: {
    minHeight: 48,
    minWidth: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.subtleBorder,
    backgroundColor: colors.raised,
  },
  chipActive: { borderColor: colors.brandText, backgroundColor: colors.brandSoft },
  chipTextActive: { color: colors.brandText, fontFamily: fonts.bold },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  noticeInfo: { backgroundColor: colors.infoSoft },
  noticeError: { backgroundColor: colors.dangerSoft },
  numeric: { writingDirection: "ltr" },
});
