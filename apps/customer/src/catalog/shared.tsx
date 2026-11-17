import { customerCatalog as text, describeCatalogUpdate } from "@be-fast/i18n";
import { Icon, PressableScale, Skeleton, type IconName } from "@be-fast/ui-native";
import { colors, radius, spacing } from "@be-fast/ui-tokens";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { customerAssetUrl } from "../api";
import { AppText, Button, Card } from "../ui";

const shadow = {
  shadowColor: colors.shadow,
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

export const catalogStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 },
  stack: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  spread: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  flexText: { flex: 1 },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.subtleBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow,
  },
  mutedCard: { backgroundColor: colors.brandTint },
  unavailableCard: { backgroundColor: colors.surface },
  button: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.subtleBorder,
    backgroundColor: colors.panel,
  },
  primary: { backgroundColor: colors.brandStrong, borderColor: colors.brandStrong },
  selected: { backgroundColor: colors.ink, borderColor: colors.ink },
  disabled: { opacity: 0.45 },
  heading: { fontSize: 18, lineHeight: 26 },
  amount: { fontSize: 22, lineHeight: 30 },
  warning: { color: colors.danger },
  thumbnail: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cover: {
    width: "100%",
    aspectRatio: 1.9,
    borderRadius: radius.lg,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  dimmedImage: { opacity: 0.55 },
  fill: { height: "100%", aspectRatio: undefined, borderRadius: 0 },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.md },
  metaItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
});

/** A pill-shaped choice or action used across catalog screens. */
export function CatalogButton({
  label,
  onPress,
  selected,
  disabled = false,
  primary,
  testID,
  icon,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  primary?: boolean;
  testID?: string;
  icon?: IconName;
}) {
  const foreground = primary || selected ? colors.onBrand : colors.ink;
  return (
    <PressableScale
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
      {icon && <Icon name={icon} size={18} color={foreground} />}
      {selected && !icon && <Icon name="check" size={16} color={foreground} />}
      <AppText weight={selected || primary ? "bold" : "medium"} style={{ color: foreground }}>
        {label}
      </AppText>
    </PressableScale>
  );
}

/** Restaurant and dish meta: an icon followed by a short value. */
export function Meta({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={catalogStyles.metaItem}>
      <Icon name={icon} size={16} color={colors.mutedInk} />
      <AppText variant="small" muted numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const imageKeyPattern = /^restaurants\/([\da-f-]{36})\/([\da-f-]{36})$/iu;

export function CatalogImage({
  imageKey,
  cover = false,
  dimmed = false,
  size,
  fill = false,
}: {
  imageKey: string | null;
  cover?: boolean;
  dimmed?: boolean;
  size?: number;
  fill?: boolean;
}) {
  const match = imageKeyPattern.exec(imageKey ?? "");
  const style = [
    cover ? catalogStyles.cover : catalogStyles.thumbnail,
    size !== undefined && { width: size, height: size },
    fill && catalogStyles.fill,
    dimmed && catalogStyles.dimmedImage,
  ];
  if (!match)
    return (
      <View style={style} accessible={false}>
        <Icon
          name={cover ? "store" : "flame"}
          size={cover ? 48 : 30}
          color={colors.brandText}
          strokeWidth={1.6}
        />
      </View>
    );
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
      transition={220}
      recyclingKey={imageKey ?? undefined}
      accessible={false}
    />
  );
}

/** Placeholder cards shown while a list loads for the first time. */
export function CatalogSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={catalogStyles.stack} accessibilityLabel={text.loading}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={catalogStyles.card}>
          <Skeleton height={150} rounded={radius.md} />
          <Skeleton width="60%" height={20} />
          <Skeleton width="85%" height={14} />
        </View>
      ))}
    </View>
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
      <Card tone={stale ? "warning" : "danger"}>
        <View style={catalogStyles.metaItem}>
          <Icon
            name={stale ? "wifiOff" : "alert"}
            size={20}
            color={stale ? colors.warning : colors.danger}
          />
          {stale ? (
            <AppText
              testID="catalog-stale"
              accessibilityLiveRegion="polite"
              tone="warning"
              style={catalogStyles.flexText}
            >
              {text.lastUpdated} {describeCatalogUpdate(dataUpdatedAt)}
            </AppText>
          ) : (
            <AppText accessibilityRole="alert" tone="danger" style={catalogStyles.flexText}>
              {text.loadError}
            </AppText>
          )}
        </View>
        <Button label={text.tryAgain} onPress={retry} icon="refresh" compact />
      </Card>
    );
  }
  return loading ? <CatalogSkeleton /> : null;
}
