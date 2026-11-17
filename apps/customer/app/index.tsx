import { customerApp as text } from "@be-fast/i18n";
import {
  Icon,
  PopOnChange,
  PressableScale,
  ScreenTransition,
  type IconName,
} from "@be-fast/ui-native";
import { colors, gradients, radius, spacing } from "@be-fast/ui-tokens";
import { randomUUID } from "expo-crypto";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "zustand";
import { AccountScreen, AddressScreen } from "../src/account";
import { publicRequest } from "../src/api";
import { CatalogScreen, CartScreen, RegionPicker, summarizeCart } from "../src/catalog";
import { CheckoutScreen } from "../src/checkout/screen";
import { OrdersScreen } from "../src/orders/orders-screen";
import { useCustomerSession } from "../src/session";
import { customerStore, flushCustomerStore } from "../src/storage";
import { AppText, Button, EmptyState, ScrollScreen, Status, styles } from "../src/ui";

const tabs: readonly (readonly [Tab, string, IconName])[] = [
  ["home", text.home, "home"],
  ["cart", text.cart, "bag"],
  ["orders", text.orders, "receipt"],
  ["account", text.account, "user"],
];
type Tab = "home" | "cart" | "orders" | "account";
type Screen = Tab | "region" | "checkout" | "addresses" | "created";

function TabBar({
  active,
  cartCount,
  onSelect,
}: {
  active: Tab;
  cartCount: number;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <View style={shell.tabBar} accessibilityRole="tablist">
      {tabs.map(([id, label, icon]) => {
        const selected = id === active;
        return (
          <PressableScale
            key={id}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onSelect(id)}
            pressedScale={0.9}
            style={shell.tab}
          >
            <View style={shell.tabIcon}>
              {selected && (
                <Animated.View
                  entering={ZoomIn.springify().damping(14)}
                  style={shell.tabPill}
                />
              )}
              <Icon
                name={icon}
                size={24}
                color={selected ? colors.brandText : colors.mutedInk}
                strokeWidth={selected ? 2.4 : 2}
              />
              {id === "cart" && cartCount > 0 && (
                <PopOnChange value={cartCount} style={shell.tabBadge}>
                  <AppText variant="caption" weight="bold" tone="onBrand">
                    {cartCount > 99 ? "99+" : cartCount}
                  </AppText>
                </PopOnChange>
              )}
            </View>
            <AppText
              variant="caption"
              weight={selected ? "bold" : "medium"}
              tone={selected ? "brand" : "muted"}
            >
              {label}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

function OrderSent({
  onTrack,
  onHome,
}: {
  onTrack: () => void;
  onHome: () => void;
}) {
  return (
    <ScrollScreen>
      <View style={shell.sent}>
        <Animated.View entering={ZoomIn.springify().damping(10).delay(80)} style={shell.sentRing}>
          <View style={shell.sentCircle}>
            <Icon name="check" size={56} color={colors.onBrand} strokeWidth={3} />
          </View>
        </Animated.View>
        <Animated.View entering={ZoomIn.delay(380)} style={shell.sparkleA}>
          <Icon name="sparkle" size={28} color={colors.brandText} />
        </Animated.View>
        <Animated.View entering={ZoomIn.delay(480)} style={shell.sparkleB}>
          <Icon name="sparkle" size={20} color={colors.brandText} />
        </Animated.View>
        <AppText variant="headline" center>
          {text.sentTitle}
        </AppText>
        <AppText center muted>
          {text.sent}
        </AppText>
        <AppText center muted variant="small">
          {text.sentHint}
        </AppText>
      </View>
      <Button label={text.showOrder} onPress={onTrack} primary icon="receipt" />
      <Button label={text.explore} onPress={onHome} variant="soft" icon="store" />
    </ScrollScreen>
  );
}

export default function HomeScreen() {
  const session = useCustomerSession();
  const state = useStore(customerStore);
  const { region, cart, attempt, profile, addresses, selectedAddressId } =
    state;
  const address = profile
    ? addresses.find(({ id }) => id === selectedAddressId)
    : undefined;
  const [screen, setScreen] = useState<Screen>("home");
  const [addressReturn, setAddressReturn] = useState<"account" | "checkout">(
    "account",
  );
  const [selectedOrder, setSelectedOrder] = useState<string>();
  const [createdOrder, setCreatedOrder] = useState<string>();
  const [currencyMode, setCurrencyMode] = useState<"OLD" | "NEW">("OLD");
  const cartCount = summarizeCart(cart)?.count ?? 0;

  function startCheckout() {
    if (!cart) return;
    if (!attempt) state.setAttempt({ key: randomUUID(), uncertain: false });
    setScreen("checkout");
  }

  function openAddresses(returnTo: typeof addressReturn) {
    setAddressReturn(returnTo);
    setScreen("addresses");
  }

  async function clearSession() {
    setSelectedOrder(undefined);
    setCreatedOrder(undefined);
    await session.clear();
  }

  function showOrders(id?: string) {
    setSelectedOrder(id);
    setScreen("orders");
  }

  function showTab(selected: Tab) {
    if (selected === "orders") setSelectedOrder(undefined);
    setScreen(selected);
  }

  const signInNotice = (
    <ScrollScreen>
      <EmptyState
        icon={screen === "orders" ? "receipt" : "user"}
        title={screen === "orders" ? text.orders : text.account}
        message={text.loginAtCheckout}
        action={
          <Button
            label={text.home}
            onPress={() => setScreen("home")}
            primary
            icon="home"
          />
        }
      />
    </ScrollScreen>
  );

  let body;
  let bodyKey: string = screen;
  if (!session.ready) {
    body = <Status busy />;
    bodyKey = "loading";
  } else if (!region || screen === "region") {
    bodyKey = "region";
    body = (
      <RegionPicker
        request={publicRequest}
        initialRegion={region}
        onSelect={(next) => {
          state.setRegion(next);
          setScreen("home");
        }}
        onCancel={region ? () => setScreen("home") : undefined}
      />
    );
  } else if (
    screen === "cart" ||
    (screen === "checkout" && (!cart || !attempt))
  ) {
    bodyKey = "cart";
    body = (
      <CartScreen
        cart={cart}
        onChangeCart={state.setCart}
        onBrowse={() => setScreen("home")}
        onCheckout={startCheckout}
      />
    );
  } else if (screen === "checkout" && cart && attempt) {
    body = (
      <CheckoutScreen
        cart={cart}
        region={region}
        attempt={attempt}
        address={address}
        profile={profile}
        request={session.request}
        publicRequest={publicRequest}
        signIn={session.signIn}
        onProfile={state.setProfile}
        onAttempt={async (value) => {
          state.setAttempt(value);
          await flushCustomerStore();
        }}
        onAddresses={() => openAddresses("checkout")}
        onOrders={() => showOrders()}
        onCreated={(id) => {
          setCurrencyMode(cart.currencyDisplayMode);
          setCreatedOrder(id);
          state.setCart(null);
          setScreen("created");
        }}
        onBack={() => setScreen("cart")}
      />
    );
  } else if (screen === "created") {
    body = (
      <OrderSent
        onTrack={() => showOrders(createdOrder)}
        onHome={() => setScreen("home")}
      />
    );
  } else if (screen === "addresses" && profile) {
    body = (
      <AddressScreen
        request={session.request}
        region={region}
        addresses={addresses}
        selectedAddressId={selectedAddressId ?? undefined}
        onUpdateAddresses={state.setAddresses}
        onSelect={(id) => {
          state.selectAddress(id);
          setScreen(addressReturn);
        }}
        onBack={() => setScreen(addressReturn)}
      />
    );
  } else if (screen === "orders") {
    bodyKey = `orders-${selectedOrder ?? "list"}`;
    body = profile ? (
      <OrdersScreen
        request={session.request}
        selectedId={selectedOrder}
        onSelect={setSelectedOrder}
        currencyDisplayMode={cart?.currencyDisplayMode ?? currencyMode}
      />
    ) : (
      signInNotice
    );
  } else if (screen === "account" || screen === "addresses") {
    bodyKey = "account";
    body = profile ? (
      <AccountScreen
        request={session.request}
        profile={profile}
        onAddresses={() => openAddresses("account")}
        onClearSession={clearSession}
        onSignOut={session.signOut}
      />
    ) : (
      signInNotice
    );
  } else {
    bodyKey = "home";
    body = (
      <CatalogScreen
        request={publicRequest}
        region={region}
        cart={cart}
        selectedAddressLabel={address?.label ?? address?.street}
        onChangeCart={state.setCart}
        onChooseRegion={() => setScreen("region")}
        onOpenCart={() => setScreen("cart")}
      />
    );
  }

  const branded = session.ready && (bodyKey === "home" || bodyKey === "region");
  const activeTab = tabs.find(([id]) => id === screen)?.[0];

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.body, branded && { backgroundColor: gradients.brand[0] }]}
    >
      <StatusBar style={branded ? "light" : "dark"} />
      <View style={styles.body}>
        <ScreenTransition screenKey={bodyKey}>{body}</ScreenTransition>
      </View>
      {region && activeTab && (
        <SafeAreaView edges={["bottom"]} style={shell.tabSafe}>
          <TabBar active={activeTab} cartCount={cartCount} onSelect={showTab} />
        </SafeAreaView>
      )}
    </SafeAreaView>
  );
}

const shell = StyleSheet.create({
  tabSafe: { backgroundColor: colors.panel },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    backgroundColor: colors.panel,
    borderTopColor: colors.subtleBorder,
    borderTopWidth: 1,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  tab: { flex: 1, alignItems: "center", gap: 2, minHeight: 52 },
  tabIcon: { width: 60, height: 32, alignItems: "center", justifyContent: "center" },
  tabPill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
  },
  tabBadge: {
    position: "absolute",
    top: -4,
    end: 8,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.brandStrong,
    borderWidth: 2,
    borderColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  sent: {
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xl,
  },
  sentRing: {
    width: 148,
    height: 148,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  sentCircle: {
    width: 108,
    height: 108,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  sparkleA: { position: "absolute", top: spacing.xxxl, end: "26%" },
  sparkleB: { position: "absolute", top: 150, start: "24%" },
});
