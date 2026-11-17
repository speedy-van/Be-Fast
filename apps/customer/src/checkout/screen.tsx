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
import { View } from "react-native";
import { serviceError, type CustomerRequest } from "../api";
import { usePublicQuery } from "../catalog/query";
import type { Cart, Region } from "../catalog/types";
import type { CheckoutAttempt } from "../store";
import {
  AppText,
  Button,
  Choices,
  Field,
  ScrollScreen,
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
  { id: "DELIVERY", label: text.delivery },
  { id: "PICKUP", label: text.pickup },
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
  return (
    <ScrollScreen>
      <Button label={text.back} onPress={onBack} disabled={busy} />
      <AppText title>{text.checkout}</AppText>
      <Choices
        label={text.type}
        selected={type}
        values={cart.pickupEnabled ? methods : methods.slice(0, 1)}
        onSelect={setType}
        disabled={locked}
      />
      {type === "DELIVERY" && (
        <View style={styles.field}>
          <AppText>{address?.label ?? address?.street ?? text.address}</AppText>
          {profile && (
            <Button
              label={text.selectAddress}
              onPress={onAddresses}
              disabled={locked}
            />
          )}
          {!canQuote && (
            <Status
              busy={quote.isFetching}
              error={quote.isError ? text.blockedOutsideArea : undefined}
              retry={() => void quote.refetch()}
            />
          )}
        </View>
      )}
      <View style={styles.card}>
        {priceRows.map(([field, label]) => (
          <AppText key={field}>
            {label} · {formatMoney(amounts[field], displayMode)}
          </AppText>
        ))}
        <AppText title testID="checkout-total">
          {text.total} · {formatMoney(amounts.totalMinor, displayMode)}
        </AppText>
        <AppText>{text.cash}</AppText>
      </View>
      <Field
        label={text.note}
        value={note}
        onChangeText={setNote}
        maxLength={300}
        editable={!locked}
        multiline
      />
      {!profile && login && (
        <View style={styles.card}>
          <Field
            label={text.phone}
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
                style={styles.numeric}
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
              />
            </>
          )}
        </View>
      )}
      {promptForName && (
        <View style={styles.card}>
          <AppText>{text.namePrompt}</AppText>
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
        </View>
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
        <>
          <AppText accessibilityLiveRegion="polite">{text.uncertain}</AppText>
          <Button label={text.checkOrders} onPress={onOrders} />
        </>
      )}
      {(!login || profile) && !promptForName && (
        <Button
          testID="checkout-confirm"
          label={attempt.priceChange ? text.confirmPrice : text.confirm}
          onPress={confirm}
          primary
          disabled={busy || (!canQuote && !attempt.body)}
        />
      )}
    </ScrollScreen>
  );
}
