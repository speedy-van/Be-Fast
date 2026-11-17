import { restaurantApp as text } from "@be-fast/i18n";
import { colors } from "@be-fast/ui-tokens";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextProps } from "react-native";

export const nativeFont = { regular: "BeFastArabic", bold: "BeFastArabicBold" } as const;

export function AppText({ title, muted, style, ...props }: TextProps & { title?: boolean; muted?: boolean }) {
  return <Text {...props} style={[styles.text, title && styles.title, muted && styles.muted, style]} />;
}

export function Button({ label, onPress, disabled, primary }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress} disabled={disabled}
      style={({ pressed }) => [styles.button, primary && styles.primary, pressed && styles.pressed]}>
      <AppText style={styles.buttonText}>{label}</AppText>
    </Pressable>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}><AppText>{label}</AppText><TextInput accessibilityLabel={label} placeholderTextColor={colors.mutedInk} {...props} style={[styles.input, style]} /></View>;
}

export function Choices<T extends string>({ label, values, selected, onSelect }: { label: string; values: readonly { id: T; label: string }[]; selected?: T; onSelect: (id: T) => void }) {
  return <View style={styles.field} accessibilityLabel={label}>
    <AppText>{label}</AppText>
    <View style={styles.row}>{values.map((option) => (
      <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected: selected === option.id }}
        onPress={() => onSelect(option.id)} style={[styles.button, selected === option.id && styles.pressed]}>
        <AppText>{option.label}</AppText>
      </Pressable>
    ))}</View>
  </View>;
}

export function ScrollScreen({ children }: { children: ReactNode }) {
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>;
}

export function Status({ busy, message, error, retry }: { busy?: boolean; message?: string; error?: string; retry?: () => void }) {
  return (
    <View style={styles.field}>
      {busy && <ActivityIndicator accessibilityLabel={text.loading} color={colors.brandText} />}
      {message && <AppText accessibilityLiveRegion="polite">{message}</AppText>}
      {error && <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText>}
      {error && retry && <Button label={text.retry} onPress={retry} />}
    </View>
  );
}

export const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16 },
  card: { backgroundColor: colors.panel, borderColor: colors.subtleBorder, borderWidth: 1, borderRadius: 12, padding: 12, gap: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  text: { color: colors.ink, fontSize: 16, fontFamily: nativeFont.regular },
  title: { fontSize: 23, fontFamily: nativeFont.bold },
  muted: { color: colors.mutedInk },
  field: { gap: 6 },
  error: { color: colors.brandText },
  button: { minHeight: 48, minWidth: 48, borderRadius: 8, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 12, justifyContent: "center", alignItems: "center", backgroundColor: colors.panel },
  buttonText: { fontFamily: nativeFont.bold },
  primary: { borderColor: colors.ink, backgroundColor: colors.brand },
  pressed: { backgroundColor: colors.highlight },
  input: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 8, color: colors.ink, fontSize: 16, fontFamily: nativeFont.regular, paddingHorizontal: 10, backgroundColor: colors.panel },
  numeric: { writingDirection: "ltr" },
});
