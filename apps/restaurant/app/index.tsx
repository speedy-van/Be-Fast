import {
  formatDamascusDateTime,
  restaurantApp as text,
  restaurantOrders,
} from "@be-fast/i18n";
import { messages } from "@be-fast/i18n";
import {
  BrandMark,
  Icon,
  PressableScale,
  Pulse,
  ScreenTransition,
  type IconName,
} from "@be-fast/ui-native";
import { darkColors as colors, radius, spacing } from "@be-fast/ui-tokens";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { serviceError } from "../src/api";
import { BranchControls } from "../src/branch-controls";
import { LoginScreen } from "../src/login";
import { MenuScreen } from "../src/menu/menu-screen";
import { OnboardingScreen } from "../src/onboarding";
import { RestaurantOrders } from "../src/orders";
import { ReportsScreen, StaffControls } from "../src/owner-controls";
import { useRestaurantGeo } from "../src/region";
import { useRestaurantAuth, useRestaurantSession } from "../src/session";
import {
  AppText,
  Button,
  nativeFont,
  ScrollScreen,
  Status,
  styles,
} from "../src/ui";

const ownerPages = [
  "orders",
  "menu",
  "onboarding",
  "reports",
  "settings",
] as const;
const staffPages = ["orders", "menu", "settings"] as const;
type Page = (typeof ownerPages)[number];
const pageIcons: Record<Page, IconName> = {
  orders: "receipt",
  menu: "list",
  onboarding: "store",
  reports: "chart",
  settings: "sliders",
};

function BranchManagement() {
  const geo = useRestaurantGeo();
  return <BranchControls geo={geo} />;
}

function SettingsScreen() {
  const { signOut } = useRestaurantAuth();
  const { role } = useRestaurantSession();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string>();
  const submitting = useRef(false);

  async function logout() {
    if (submitting.current) return;
    submitting.current = true;
    setSigningOut(true);
    setError(undefined);
    try {
      await signOut();
    } catch (cause) {
      setError(serviceError(cause));
    } finally {
      submitting.current = false;
      setSigningOut(false);
    }
  }

  return (
    <ScrollScreen>
      <AppText title>{text.settings}</AppText>
      {(role === "OWNER" || role === "MANAGER") && <BranchManagement />}
      {role === "OWNER" && <StaffControls />}
      <Status busy={signingOut} error={error} />
      <Button
        label={text.logout}
        icon="logout"
        danger
        onPress={() => void logout()}
        disabled={signingOut}
      />
    </ScrollScreen>
  );
}

function Workspace() {
  const { role, restaurantStatus } = useRestaurantSession();
  const [selection, select] = useState<Page>(() =>
    role === "OWNER" && restaurantStatus !== "APPROVED"
      ? "onboarding"
      : "orders",
  );
  const [connection, setConnection] = useState<{
    offline: boolean;
    lastUpdatedAt?: string;
  }>();
  const pages: readonly Page[] = role === "OWNER" ? ownerPages : staffPages;
  const page = pages.includes(selection) ? selection : "orders";

  return (
    <View style={styles.body}>
      <View style={layout.header}>
        <View style={layout.brand}>
          <BrandMark size={40} body={colors.brand} bolt={colors.surface} gap={colors.surface} />
        </View>
        <View style={styles.flex}>
          <AppText style={layout.brandName}>{messages.brand.name}</AppText>
          <AppText muted style={layout.caption}>
            {text[page]}
          </AppText>
        </View>
        <Pulse active={!connection?.offline}>
          <View
            style={[
              layout.live,
              { backgroundColor: connection?.offline ? colors.danger : colors.success },
            ]}
          />
        </Pulse>
      </View>
      <View style={styles.body}>
        <RestaurantOrders
          visible={page === "orders"}
          onConnectionChange={setConnection}
        />
        {page !== "orders" && connection?.offline && (
          <View style={layout.offline} accessibilityLiveRegion="polite">
            <AppText style={styles.error}>{restaurantOrders.offline}</AppText>
            <AppText muted>
              {connection.lastUpdatedAt
                ? `${restaurantOrders.lastUpdated} ${formatDamascusDateTime(connection.lastUpdatedAt)}`
                : restaurantOrders.noUpdate}
            </AppText>
          </View>
        )}
        {page !== "orders" && (
          <ScreenTransition screenKey={page}>
            {page === "menu" && <MenuScreen />}
            {page === "onboarding" && <OnboardingScreen />}
            {page === "reports" && <ReportsScreen />}
            {page === "settings" && <SettingsScreen />}
          </ScreenTransition>
        )}
      </View>
      <View style={layout.navigation} accessibilityRole="tablist">
        {pages.map((item) => {
          const selected = page === item;
          return (
            <PressableScale
              key={item}
              accessibilityRole="tab"
              accessibilityLabel={text[item]}
              accessibilityState={{ selected }}
              onPress={() => select(item)}
              pressedScale={0.9}
              style={layout.tab}
            >
              <View style={layout.tabIcon}>
                {selected && (
                  <Animated.View
                    entering={ZoomIn.springify().damping(14)}
                    style={layout.tabPill}
                  />
                )}
                <Icon
                  name={pageIcons[item]}
                  size={24}
                  color={selected ? colors.brandText : colors.mutedInk}
                  strokeWidth={selected ? 2.4 : 2}
                />
              </View>
              <AppText
                numberOfLines={1}
                style={[layout.tabLabel, selected && layout.tabLabelActive]}
              >
                {text[item]}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { state, restore } = useRestaurantAuth();
  return (
    <SafeAreaView style={styles.body}>
      {state.phase === "anonymous" && <LoginScreen />}
      {state.phase === "ready" && (
        <Workspace key={state.credentials.restaurantId} />
      )}
      {state.phase === "loading" && <Status busy />}
      {state.phase === "error" && (
        <ScrollScreen>
          <Status error={serviceError(state.error)} retry={restore} />
        </ScrollScreen>
      )}
    </SafeAreaView>
  );
}

const layout = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.subtleBorder,
    backgroundColor: colors.surface,
  },
  brand: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: { fontFamily: nativeFont.bold, fontSize: 18, lineHeight: 26 },
  caption: { fontSize: 13, lineHeight: 18 },
  live: { width: 12, height: 12, borderRadius: 6 },
  navigation: {
    flexDirection: "row",
    backgroundColor: colors.panel,
    borderTopColor: colors.subtleBorder,
    borderTopWidth: 1,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  tab: { flex: 1, alignItems: "center", gap: 2, minHeight: 52 },
  tabIcon: { width: 56, height: 32, alignItems: "center", justifyContent: "center" },
  tabPill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
  },
  tabLabel: { fontSize: 12, lineHeight: 16, color: colors.mutedInk },
  tabLabelActive: { color: colors.brandText, fontFamily: nativeFont.bold },
  offline: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.highlight,
  },
});
