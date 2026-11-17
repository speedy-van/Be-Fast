import { customerApp as text, messages } from "@be-fast/i18n";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "zustand";
import { AccountScreen, AddressScreen } from "../src/account";
import { publicRequest } from "../src/api";
import { CatalogScreen, CartScreen, RegionPicker } from "../src/catalog";
import { CheckoutScreen } from "../src/checkout/screen";
import { OrdersScreen } from "../src/orders/orders-screen";
import { useCustomerSession } from "../src/session";
import { customerStore, flushCustomerStore } from "../src/storage";
import { AppText, Button, ScrollScreen, Status, styles } from "../src/ui";

const tabs = [
  ["home", text.home],
  ["cart", text.cart],
  ["orders", text.orders],
  ["account", text.account],
] as const;
type Tab = (typeof tabs)[number][0];
type Screen = Tab | "region" | "checkout" | "addresses" | "created";

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
      <AppText title>
        {screen === "orders" ? text.orders : text.account}
      </AppText>
      <AppText>{text.loginAtCheckout}</AppText>
      <Button label={text.home} onPress={() => setScreen("home")} />
    </ScrollScreen>
  );

  let body;
  if (!session.ready) {
    body = <Status busy />;
  } else if (!region || screen === "region") {
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
      <ScrollScreen>
        <AppText title>{text.sent}</AppText>
        <Button
          label={text.showOrder}
          onPress={() => showOrders(createdOrder)}
          primary
        />
      </ScrollScreen>
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

  return (
    <SafeAreaView style={styles.body}>
      <AppText accessibilityRole="header" style={styles.appTitle}>
        {messages.apps.customer}
      </AppText>
      <View style={styles.body}>{body}</View>
      {region && tabs.some(([id]) => id === screen) && (
        <View style={styles.navigation}>
          {tabs.map(([id, label]) => (
            <Button
              key={id}
              primary={id === screen}
              label={label}
              onPress={() => showTab(id)}
            />
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}
