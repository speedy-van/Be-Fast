import { customerCatalog as text, describeCatalogUpdate } from "@be-fast/i18n";
import { colors } from "@be-fast/ui-tokens";
import { Image } from "expo-image";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { customerAssetUrl } from "../api";
import { AppText } from "../ui";

export const catalogStyles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 14 },
  stack: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  spread: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  flexText: { flex: 1 },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.subtleBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  mutedCard: { backgroundColor: colors.highlight },
  unavailableCard: { backgroundColor: colors.surface },
  button: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  primary: { backgroundColor: colors.brand, borderColor: colors.ink },
  selected: {
    backgroundColor: colors.highlight,
    borderColor: colors.brandText,
  },
  disabled: { opacity: 0.62 },
  heading: { fontSize: 20 },
  amount: { fontSize: 22 },
  warning: { color: colors.brandText },
  thumbnail: {
    width: 84,
    height: 84,
    borderRadius: 9,
    backgroundColor: colors.highlight,
  },
  cover: {
    width: "100%",
    aspectRatio: 2.2,
    borderRadius: 10,
    backgroundColor: colors.highlight,
  },
  dimmedImage: { opacity: 0.65 },
});

export function CatalogButton({
  label,
  onPress,
  selected,
  disabled = false,
  primary,
  testID,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  primary?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        catalogStyles.button,
        primary && catalogStyles.primary,
        selected && catalogStyles.selected,
        disabled && catalogStyles.disabled,
      ]}
    >
      <AppText>{label}</AppText>
    </Pressable>
  );
}

const imageKeyPattern = /^restaurants\/([\da-f-]{36})\/([\da-f-]{36})$/iu;

export function CatalogImage({
  imageKey,
  cover = false,
  dimmed = false,
}: {
  imageKey: string | null;
  cover?: boolean;
  dimmed?: boolean;
}) {
  const match = imageKeyPattern.exec(imageKey ?? "");
  const style = [
    cover ? catalogStyles.cover : catalogStyles.thumbnail,
    dimmed && catalogStyles.dimmedImage,
  ];
  if (!match) return <View style={style} accessible={false} />;
  const [, restaurantId, assetId] = match;
  const uri = customerAssetUrl(
    `/public/images/${restaurantId}/${assetId}/${cover ? "640" : "320"}`,
  );
  return (
    <Image
      style={style}
      source={{ uri }}
      contentFit="cover"
      cachePolicy="disk"
      recyclingKey={imageKey ?? undefined}
      accessible={false}
    />
  );
}

export function CatalogNotice({
  error,
  loading,
  dataUpdatedAt,
  retry,
}: {
  error: boolean;
  loading: boolean;
  dataUpdatedAt: number;
  retry: () => void;
}) {
  const stale = error && dataUpdatedAt > 0;
  if (error) {
    return (
      <View style={[catalogStyles.card, catalogStyles.mutedCard]}>
        {stale ? (
          <AppText testID="catalog-stale" accessibilityLiveRegion="polite">
            {text.lastUpdated} {describeCatalogUpdate(dataUpdatedAt)}
          </AppText>
        ) : (
          <AppText accessibilityRole="alert" style={catalogStyles.warning}>
            {text.loadError}
          </AppText>
        )}
        <CatalogButton label={text.tryAgain} onPress={retry} />
      </View>
    );
  }
  return loading ? (
    <ActivityIndicator
      accessibilityLabel={text.loading}
      color={colors.brandText}
    />
  ) : null;
}
