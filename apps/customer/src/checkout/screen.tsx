import {
  authTokensSchema,
  customerOtpRequestSchema,
  customerOtpVerifySchema,
  customerProfileSchema,
  customerProfileUpdateSchema,
  publicRestaurantDetailResponseSchema,
  type AuthTokens,
  type OrderCreate,
} from "@be-fast/contracts";
import { calcItemTotal, calcOrderTotals, formatMoney } from "@be-fast/domain";
import { customerApp as text, messages } from "@be-fast/i18n";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Icon } from "@be-fast/ui-native";
import { colors, radius, spacing } from "@be-fast/ui-tokens";
import { serviceError, type CustomerRequest } from "../api";
import { usePublicQuery } from "../catalog/query";
import type { Cart, Region } from "../catalog/types";
import type { CheckoutAttempt } from "../store";
import {
  AppText,
  Button,
  Card,
  Choices,
  Divider,
  Field,
  InfoRow,
  ScreenHeader,
  ScrollScreen,
  SectionTitle,
  Status,
  styles,
} from "../ui";
import { submitOrderWithRetries } from "./submit";

type Profile = ReturnType<typeof customerProfileSchema.parse>;
type OrderType = OrderCreate["type"];

interface CheckoutProps {
  cart: Cart;
  region: Region;
  attempt: CheckoutAttempt;
  address?: {
    id: string;
    neighborhoodId: string;
    street: string;
    label: string | null;
  };
  profile: Profile | null;
  request: CustomerRequest;
  publicRequest: CustomerRequest;
  signIn: (tokens: AuthTokens) => Promise<void>;
  onProfile: (profile: Profile) => void;
  onAttempt: (attempt: CheckoutAttempt) => Promise<void>;
  onAddresses: () => void;
  onOrders: () => void;
  onCreated: (id: string) => void;
  onBack: () => void;
}

const methods = [
  { id: "DELIVERY", label: text.delivery, icon: "scooter" },
  { id: "PICKUP", label: text.pickup, icon: "store" },
] as const;
const priceRows = [
  ["foodSubtotalMinor", text.foodSubtotal],
  ["deliveryFeeMinor", text.deliveryFee],
  ["discountMinor", text.discount],
] as const;

export function CheckoutScreen({
  cart,
  region,
  attempt,
  address,
  profile,
  request,
  publicRequest,
  signIn,
  onProfile,
  onAttempt,
  onAddresses,
  onOrders,
  onCreated,
  onBack,
}: CheckoutProps) {
  const [type, setType] = useState<OrderType>(attempt.body?.type ?? "DELIVERY");
  const [note, setNote] = useState(attempt.body?.note ?? "");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [login, setLogin] = useState<"phone" | "code" | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string>();
  const busyRef = useRef(false);
  const verifiedPair = useRef<AuthTokens | null>(null);
  const displayAddress = type === "DELIVERY" ? address : undefined;
  const zone = displayAddress?.neighborhoodId ?? region.neighborhoodId;
  const quote = usePublicQuery(
    `/public/restaurants/${cart.restaurantId}?neighborhoodId=${zone}`,
    publicRestaurantDetailResponseSchema,
    publicRequest,
  );
  const isAnotherZone = displayAddress && zone !== region.neighborhoodId;
  const canQuote =
    type === "PICKUP" ||
    !isAnotherZone ||
    quote.data?.branchId === cart.branchId;
  const estimates = calcOrderTotals(
    cart.items.map((item) =>
      calcItemTotal(item.sizePriceMinor, item.optionPricesMinor, item.quantity),
    ),
    type === "PICKUP"
      ? 0
      : (quote.data?.deliveryFeeMinor ?? cart.deliveryFeeMinor),
    0,
  );
  const amounts = attempt.priceChange ?? estimates;
  const displayMode =
    quote.data?.currencyDisplayMode ?? cart.currencyDisplayMode;
  const locked = busy || attempt.uncertain || attempt.priceChange !== undefined;

  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(serviceError(cause));
    } finally {
      busyRef.current = false;
      setBusy(false);
      setChecking(false);
    }
  }

  function requestCode() {
    const input = customerOtpRequestSchema.safeParse({ phone });
    if (!input.success) {
      setError(messages.errors.validationError);
      return;
    }
    void run(async () => {
      await publicRequest("/auth/customer/otp/request", {
        method: "POST",
        body: input.data,
      });
      verifiedPair.current = null;
      setLogin("code");
    });
  }

  function verifyCode() {
    const input = customerOtpVerifySchema.safeParse({ phone, code });
    if (!input.success) {
      setError(messages.errors.validationError);
      return;
    }
    void run(async () => {
      const pair =
        verifiedPair.current ??
        (await publicRequest(
          "/auth/customer/otp/verify",
          { method: "POST", body: input.data },
          authTokensSchema,
        ));
      verifiedPair.current = pair;
      await signIn(pair);
      verifiedPair.current = null;
      setLogin(null);
    });
  }

  function saveName() {
    const input = customerProfileUpdateSchema.safeParse({ name });
    if (!input.success) {
      setError(messages.errors.validationError);
      return;
    }
    void run(async () => {
      onProfile(
        await request(
          "/customer/me",
          { method: "PATCH", body: input.data },
          customerProfileSchema,
        ),
      );
    });
  }

  function confirm() {
    if (busyRef.current) return;
    setError(undefined);
    if (!profile) {
      setLogin("phone");
      return;
    }
    if (!profile.name) return;
    if (!attempt.body && type === "DELIVERY" && !address) {
      onAddresses();
      return;
    }
    if (!attempt.body && !canQuote) return;
    const common = {
      branchId: cart.branchId,
      items: cart.items.map(
        ({ menuItemId, sizeId, optionIds, quantity, note: itemNote }) => ({
          menuItemId,
          sizeId,
          optionIds,
          quantity,
          note: itemNote,
        }),
      ),
      note: note.trim() || undefined,
      expectedTotalMinor: estimates.totalMinor,
    };
    const retainedBody = attempt.body && {
      ...attempt.body,
      expectedTotalMinor:
        attempt.priceChange?.totalMinor ?? attempt.body.expectedTotalMinor,
    };
    const body =
      retainedBody ??
      (type === "DELIVERY" && address
        ? { ...common, type: "DELIVERY" as const, addressId: address.id }
        : { ...common, type: "PICKUP" as const });
    void run(async () => {
      await onAttempt({
        key: attempt.key,
        uncertain: true,
        body,
        priceChange: attempt.priceChange,
      });
      const result = await submitOrderWithRetries({
        body,
        key: attempt.key,
        request,
        onUncertain: () => setChecking(true),
      });
      switch (result.kind) {
        case "created":
          onCreated(result.orderId);
          break;
        case "priceChanged":
          await onAttempt({
            key: attempt.key,
            uncertain: false,
            body,
            priceChange: result.details,
          });
          break;
        case "failed":
          // A definitive failure after an uncertain POST cannot rule out an earlier success.
          if (attempt.uncertain)
            await onAttempt({
              key: attempt.key,
              uncertain: true,
              body,
              priceChange: attempt.priceChange,
            });
          else await onAttempt({ key: attempt.key, uncertain: false });
          setError(serviceError(result.error));
          break;
        case "uncertain":
        case "aborted":
          break;
      }
    });
  }

  const promptForName = profile && !profile.name;
  const showConfirm = (!login || profile) && !promptForName;
  return (
    <ScrollScreen
      footer={
        showConfirm ? (
          <>
            <InfoRow
              label={text.total}
              value={formatMoney(amounts.totalMinor, displayMode)}
              strong
            />
            <Button
              testID="checkout-confirm"
              label={attempt.priceChange ? text.confirmPrice : text.confirm}
              onPress={confirm}
              primary
              icon="check"
              disabled={busy || (!canQuote && !attempt.body)}
            />
          </>
        ) : undefined
      }
    >
      <ScreenHeader
        title={text.checkout}
        subtitle={cart.restaurantName}
        onBack={onBack}
        backDisabled={busy}
      />
      <Card>
        <Choices
          label={text.type}
          selected={type}
          values={cart.pickupEnabled ? methods : methods.slice(0, 1)}
          onSelect={setType}
          disabled={locked}
        />
        {type === "DELIVERY" && (
          <View style={styles.field}>
            <Divider />
            <View style={styles.inline}>
              <View style={local.addressIcon}>
                <Icon name="pin" size={20} color={colors.brandText} />
              </View>
              <View style={styles.flex}>
                <AppText variant="small" muted>
                  {text.deliveryAddress}
                </AppText>
                <AppText weight="semibold" numberOfLines={2}>
                  {address?.label ?? address?.street ?? text.address}
                </AppText>
              </View>
              {profile && (
                <Button
                  label={address ? text.change : text.selectAddress}
                  onPress={onAddresses}
                  disabled={locked}
                  variant="soft"
                  compact
                />
              )}
            </View>
            {!canQuote && (
              <Status
                busy={quote.isFetching}
                error={quote.isError ? text.blockedOutsideArea : undefined}
                retry={() => void quote.refetch()}
              />
            )}
          </View>
        )}
      </Card>
      <Card>
        <SectionTitle title={text.orderSummary} icon="receipt" />
        {cart.items.map((line) => (
          <View key={line.key} style={local.line}>
            <View style={local.qty}>
              <AppText variant="small" weight="bold" tone="brand">
                {line.quantity}×
              </AppText>
            </View>
            <AppText style={styles.flex} numberOfLines={1}>
              {line.name}
            </AppText>
          </View>
        ))}
        <Divider />
        {priceRows.map(([field, label]) => (
          <InfoRow
            key={field}
            label={label}
            value={formatMoney(amounts[field], displayMode)}
          />
        ))}
        <Divider />
        <View style={local.total}>
          <AppText variant="title">{text.total}</AppText>
          <AppText
            variant="title"
            weight="bold"
            tone="brand"
            testID="checkout-total"
            style={styles.numeric}
          >
            {formatMoney(amounts.totalMinor, displayMode)}
          </AppText>
        </View>
      </Card>
      <Card tone="success">
        <View style={styles.inline}>
          <Icon name="cash" size={24} color={colors.success} />
          <View style={styles.flex}>
            <AppText weight="bold" tone="success">
              {text.cash}
            </AppText>
            <AppText variant="small" muted>
              {text.cashHint}
            </AppText>
          </View>
        </View>
      </Card>
      <Field
        label={text.note}
        icon="note"
        value={note}
        onChangeText={setNote}
        maxLength={300}
        editable={!locked}
        multiline
      />
      {!profile && login && (
        <Card tone="tint">
          <SectionTitle title={text.verifyTitle} icon="phone" />
          <AppText variant="small" muted>
            {text.verifyHint}
          </AppText>
          <Field
            label={text.phone}
            icon="phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            style={styles.numeric}
            editable={login === "phone" && !busy}
          />
          {login === "phone" ? (
            <Button
              label={text.sendCode}
              onPress={requestCode}
              disabled={busy}
              primary
            />
          ) : (
            <>
              <Field
                label={text.otp}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                maxLength={6}
                style={[styles.numeric, local.otp]}
                editable={!busy}
              />
              <Button
                label={text.verifyCode}
                onPress={verifyCode}
                disabled={busy}
                primary
              />
              <Button
                label={text.retry}
                onPress={() => setLogin("phone")}
                disabled={busy}
                variant="ghost"
              />
            </>
          )}
        </Card>
      )}
      {promptForName && (
        <Card tone="tint">
          <SectionTitle title={text.namePrompt} icon="user" />
          <Field
            label={text.name}
            value={name}
            onChangeText={setName}
            maxLength={120}
            editable={!busy}
          />
          <Button
            label={text.save}
            onPress={saveName}
            disabled={busy}
            primary
          />
        </Card>
      )}
      <Status
        busy={busy}
        message={
          checking
            ? text.checking
            : attempt.priceChange && !busy
              ? text.priceChanged
              : undefined
        }
        error={error}
      />
      {attempt.uncertain && !busy && (
        <Card tone="warning">
          <AppText accessibilityLiveRegion="polite" tone="warning">
            {text.uncertain}
          </AppText>
          <Button label={text.checkOrders} onPress={onOrders} icon="receipt" />
        </Card>
      )}
    </ScrollScreen>
  );
}

const local = StyleSheet.create({
  addressIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  qty: {
    minWidth: 34,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.brandTint,
    alignItems: "center",
  },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  otp: { fontSize: 22, letterSpacing: 8 },
});
