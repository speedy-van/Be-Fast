import { customerApp as text } from "@be-fast/i18n";
import {
  fonts,
  GradientFill,
  Icon,
  PressableScale,
  type IconName,
} from "@be-fast/ui-native";
import {
  colors,
  fontSize,
  radius,
  spacing,
} from "@be-fast/ui-tokens";
import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from "react-native";

export const nativeFont = fonts;

type Variant = "display" | "headline" | "title" | "body" | "small" | "caption";
type Tone = "ink" | "muted" | "brand" | "success" | "danger" | "warning" | "onBrand";
type Weight = "regular" | "medium" | "semibold" | "bold";

const toneColor: Record<Tone, string> = {
  ink: colors.ink,
  muted: colors.mutedInk,
  brand: colors.brandText,
  success: colors.success,
  danger: colors.danger,
  warning: colors.warning,
  onBrand: colors.onBrand,
};

export function AppText({
  title,
  muted,
  variant,
  weight,
  tone,
  center,
  style,
  ...props
}: TextProps & {
  title?: boolean;
  muted?: boolean;
  variant?: Variant;
  weight?: Weight;
  tone?: Tone;
  center?: boolean;
}) {
  const resolved = variant ?? (title ? "headline" : "body");
  return (
    <Text
      {...props}
      style={[
        styles.text,
        typeScale[resolved],
        weight && { fontFamily: fonts[weight] },
        muted && styles.muted,
        tone && { color: toneColor[tone] },
        center && styles.center,
        style,
      ]}
    />
  );
}

export function Button({
  label,
  onPress,
  disabled,
  primary,
  testID,
  icon,
  variant,
  compact,
  trailing,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  testID?: string;
  icon?: IconName;
  variant?: "secondary" | "ghost" | "danger" | "soft";
  compact?: boolean;
  trailing?: ReactNode;
}) {
  const kind = primary ? "primary" : (variant ?? "secondary");
  const foreground =
    kind === "primary"
      ? colors.onBrand
      : kind === "danger"
        ? colors.danger
        : kind === "soft" || kind === "ghost"
          ? colors.brandText
          : colors.ink;
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        compact && styles.buttonCompact,
        buttonKinds[kind],
        disabled && styles.disabled,
      ]}
    >
      {kind === "primary" && (
        <GradientFill from={colors.brandStrong} to={colors.brandDeep} id="button" />
      )}
      {icon && <Icon name={icon} size={compact ? 18 : 20} color={foreground} />}
      <AppText
        weight="bold"
        variant={compact ? "small" : "body"}
        style={{ color: foreground }}
        numberOfLines={1}
      >
        {label}
      </AppText>
      {trailing}
    </PressableScale>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  testID,
  badge,
  tone = "surface",
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID?: string;
  badge?: number;
  tone?: "surface" | "brand" | "glass";
  disabled?: boolean;
}) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      pressedScale={0.9}
      style={[styles.iconButton, iconButtonTones[tone], disabled && styles.disabled]}
    >
      <Icon
        name={icon}
        size={22}
        color={tone === "brand" ? colors.onBrand : colors.ink}
      />
      {badge !== undefined && badge > 0 && (
        <View style={styles.badge}>
          <AppText variant="caption" weight="bold" tone="onBrand">
            {badge > 99 ? "99+" : badge}
          </AppText>
        </View>
      )}
    </PressableScale>
  );
}

export function Field({
  label,
  icon,
  style,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & { label: string; icon?: IconName }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <AppText variant="small" weight="semibold">
        {label}
      </AppText>
      <View
        style={[
          styles.inputBox,
          focused && styles.inputFocused,
          props.multiline && styles.inputMultiline,
        ]}
      >
        {icon && <Icon name={icon} size={20} color={colors.mutedInk} />}
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
          style={[styles.input, style]}
        />
      </View>
    </View>
  );
}

export function Choices<T extends string>({
  label,
  values,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  values: readonly { id: T; label: string; icon?: IconName }[];
  selected?: T;
  onSelect: (id: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.field}>
      <AppText variant="small" weight="semibold">
        {label}
      </AppText>
      <View style={styles.segmented}>
        {values.map(({ id, label: choice, icon }) => {
          const active = selected === id;
          return (
            <PressableScale
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled }}
              disabled={disabled}
              onPress={() => onSelect(id)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              {icon && (
                <Icon
                  name={icon}
                  size={18}
                  color={active ? colors.brandText : colors.mutedInk}
                />
              )}
              <AppText
                weight={active ? "bold" : "medium"}
                tone={active ? "brand" : "muted"}
              >
                {choice}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

export function ScrollScreen({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <View style={styles.body}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, footer ? styles.withFooter : null]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer && <BottomBar>{footer}</BottomBar>}
    </View>
  );
}

export function BottomBar({ children }: { children: ReactNode }) {
  return <View style={styles.bottomBar}>{children}</View>;
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backDisabled,
  accessory,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backDisabled?: boolean;
  accessory?: ReactNode;
}) {
  return (
    <View style={styles.screenHeader}>
      {onBack && (
        <IconButton
          icon="back"
          label={text.back}
          onPress={onBack}
          disabled={backDisabled}
        />
      )}
      <View style={styles.flex}>
        <AppText variant="headline" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle && (
          <AppText variant="small" muted numberOfLines={1}>
            {subtitle}
          </AppText>
        )}
      </View>
      {accessory}
    </View>
  );
}

export function Card({
  children,
  style,
  tone = "panel",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "panel" | "tint" | "success" | "warning" | "danger";
}) {
  return <View style={[styles.card, cardTones[tone], style]}>{children}</View>;
}

export function SectionTitle({
  title,
  icon,
  accessory,
}: {
  title: string;
  icon?: IconName;
  accessory?: ReactNode;
}) {
  return (
    <View style={styles.sectionTitle}>
      {icon && (
        <View style={styles.sectionIcon}>
          <Icon name={icon} size={18} color={colors.brandText} />
        </View>
      )}
      <AppText variant="title" style={styles.flex} accessibilityRole="header">
        {title}
      </AppText>
      {accessory}
    </View>
  );
}

export function Pill({
  label,
  icon,
  tone = "neutral",
}: {
  label: string;
  icon?: IconName;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "dark";
}) {
  const palette = pillTones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.background }]}>
      {icon && <Icon name={icon} size={14} color={palette.foreground} strokeWidth={2.2} />}
      <AppText
        variant="caption"
        weight="semibold"
        style={{ color: palette.foreground }}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </View>
  );
}

export function InfoRow({
  label,
  value,
  strong,
  testID,
}: {
  label: string;
  value: string;
  strong?: boolean;
  testID?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <AppText variant={strong ? "title" : "body"} muted={!strong}>
        {label}
      </AppText>
      <AppText
        testID={testID}
        variant={strong ? "title" : "body"}
        weight={strong ? "bold" : "semibold"}
        style={styles.numeric}
      >
        {value}
      </AppText>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: IconName;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={40} color={colors.brandText} strokeWidth={1.6} />
      </View>
      <AppText variant="title" center>
        {title}
      </AppText>
      {message && (
        <AppText muted center>
          {message}
        </AppText>
      )}
      {action}
    </View>
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
  if (!busy && !message && !error) return null;
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
        <Card tone="tint">
          <View style={styles.inline}>
            <Icon name="info" size={20} color={colors.brandText} />
            <AppText accessibilityLiveRegion="polite" style={styles.flex}>
              {message}
            </AppText>
          </View>
        </Card>
      )}
      {error && (
        <Card tone="danger">
          <View style={styles.inline}>
            <Icon name="alert" size={20} color={colors.danger} />
            <AppText accessibilityRole="alert" tone="danger" style={styles.flex}>
              {error}
            </AppText>
          </View>
          {retry && (
            <Button label={text.retry} onPress={retry} icon="refresh" compact />
          )}
        </Card>
      )}
    </View>
  );
}

const typeScale = StyleSheet.create({
  display: { fontSize: fontSize.display, lineHeight: 44, fontFamily: fonts.bold },
  headline: { fontSize: fontSize.headline - 4, lineHeight: 34, fontFamily: fonts.bold },
  title: { fontSize: fontSize.large, lineHeight: 26, fontFamily: fonts.bold },
  body: { fontSize: fontSize.body, lineHeight: 24 },
  small: { fontSize: fontSize.small, lineHeight: 20 },
  caption: { fontSize: fontSize.caption, lineHeight: 16 },
});

const shadow = {
  shadowColor: colors.shadow,
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

const buttonKinds = StyleSheet.create({
  primary: { borderColor: colors.transparent, ...shadow, elevation: 3 },
  secondary: { backgroundColor: colors.panel, borderColor: colors.subtleBorder },
  ghost: { backgroundColor: colors.transparent, borderColor: colors.transparent },
  danger: { backgroundColor: colors.dangerSoft, borderColor: colors.transparent },
  soft: { backgroundColor: colors.brandTint, borderColor: colors.transparent },
});

const iconButtonTones = StyleSheet.create({
  surface: { backgroundColor: colors.panel, ...shadow },
  brand: { backgroundColor: colors.brandStrong },
  glass: { backgroundColor: colors.panel, opacity: 0.94, ...shadow },
});

const cardTones = StyleSheet.create({
  panel: { backgroundColor: colors.panel },
  tint: { backgroundColor: colors.brandTint, borderColor: colors.brandSoft, elevation: 0, shadowOpacity: 0 },
  success: { backgroundColor: colors.successSoft, borderColor: colors.successSoft, elevation: 0, shadowOpacity: 0 },
  warning: { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft, elevation: 0, shadowOpacity: 0 },
  danger: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft, elevation: 0, shadowOpacity: 0 },
});

const pillTones = {
  neutral: { background: colors.surface, foreground: colors.mutedInk },
  brand: { background: colors.brandTint, foreground: colors.brandText },
  success: { background: colors.successSoft, foreground: colors.success },
  warning: { background: colors.warningSoft, foreground: colors.warning },
  danger: { background: colors.dangerSoft, foreground: colors.danger },
  info: { background: colors.infoSoft, foreground: colors.info },
  dark: { background: colors.ink, foreground: colors.onBrand },
} as const;

export const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  center: { textAlign: "center" },
  appTitle: { fontFamily: fonts.bold },
  navigation: {},
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  withFooter: { paddingBottom: 120 },
  field: { gap: spacing.sm },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  inline: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.subtleBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow,
  },
  text: {
    color: colors.ink,
    fontSize: fontSize.body,
    fontFamily: fonts.regular,
    textAlign: "auto",
  },
  title: { fontSize: fontSize.title, fontFamily: fonts.bold },
  muted: { color: colors.mutedInk },
  error: { color: colors.danger },
  button: {
    minHeight: 52,
    minWidth: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    overflow: "hidden",
  },
  buttonCompact: { minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  buttonText: { fontFamily: fonts.bold },
  primary: {},
  pressed: { backgroundColor: colors.highlight },
  disabled: { opacity: 0.5 },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -2,
    end: -2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.brandStrong,
    borderColor: colors.panel,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  inputBox: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderColor: colors.subtleBorder,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.panel,
  },
  inputFocused: { borderColor: colors.brandText, backgroundColor: colors.panel },
  inputMultiline: { alignItems: "flex-start", paddingVertical: spacing.sm, minHeight: 96 },
  input: {
    flex: 1,
    minHeight: 48,
    color: colors.ink,
    fontSize: fontSize.body,
    fontFamily: fonts.regular,
    textAlignVertical: "top",
    paddingVertical: spacing.sm,
  },
  numeric: { writingDirection: "ltr" },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.panel,
    borderColor: colors.subtleBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    minHeight: 48,
    minWidth: 48,
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  segmentActive: { backgroundColor: colors.brandTint },
  bottomBar: {
    position: "absolute",
    start: 0,
    end: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.panel,
    borderTopColor: colors.subtleBorder,
    borderTopWidth: 1,
    gap: spacing.sm,
    ...shadow,
    elevation: 12,
  },
  screenHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 1,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  divider: { height: 1, backgroundColor: colors.subtleBorder },
  empty: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xxxl },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
});
