import {
  formatDamascusDateTime,
  restaurantApp as text,
  restaurantOrders,
} from "@be-fast/i18n";
import { colors } from "@be-fast/ui-tokens";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
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
import { AppText, Button, ScrollScreen, Status, styles } from "../src/ui";

const ownerPages = [
  "orders",
  "menu",
  "onboarding",
  "reports",
  "settings",
] as const;
const staffPages = ["orders", "menu", "settings"] as const;
type Page = (typeof ownerPages)[number];

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
        {page === "menu" && <MenuScreen />}
        {page === "onboarding" && <OnboardingScreen />}
        {page === "reports" && <ReportsScreen />}
        {page === "settings" && <SettingsScreen />}
      </View>
      <ScrollView
        horizontal
        style={layout.navigation}
        contentContainerStyle={layout.tabs}
      >
        {pages.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: page === item }}
            onPress={() => select(item)}
            style={[layout.tab, page === item && styles.pressed]}
          >
            <AppText>{text[item]}</AppText>
          </Pressable>
        ))}
      </ScrollView>
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
  navigation: {
    flexGrow: 0,
    backgroundColor: colors.panel,
    borderTopColor: colors.subtleBorder,
    borderTopWidth: 1,
  },
  tabs: {
    flexGrow: 1,
    justifyContent: "space-evenly",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tab: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  offline: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.highlight,
  },
});
