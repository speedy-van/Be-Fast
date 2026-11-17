import {
  orderListResponseSchema,
  orderReadSchema,
  type OrderReadResponse,
} from "@be-fast/contracts";
import {
  canTransition,
  formatMoney,
  normalizeSyrianPhone,
  TERMINAL_STATES,
  type DisplayMode,
} from "@be-fast/domain";
import {
  customerOrdersText as text,
  formatDamascusDateTime,
  messages,
} from "@be-fast/i18n";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, View } from "react-native";
import { serviceError, type CustomerRequest } from "../api";
import { AppText, Button, ScrollScreen, Status, styles } from "../ui";
import { responseRemainingSeconds } from "./countdown";
import { OrderComplaint } from "./order-complaint";
import { useOrderRead } from "./use-order-read";

const pollInterval = 15_000;

export interface OrdersScreenProps {
  request: CustomerRequest;
  selectedId?: string;
  onSelect(id?: string): void;
  currencyDisplayMode: DisplayMode;
}

function staleCopy(error: string | undefined, updatedAt: number | undefined) {
  return error && updatedAt !== undefined
    ? text.stale(formatDamascusDateTime(new Date(updatedAt).toISOString()))
    : undefined;
}

function ResponseCountdown({
  serverTime,
  expiresAt,
  receivedAt,
}: {
  serverTime: string;
  expiresAt: string;
  receivedAt: number;
}) {
  const [elapsed, setElapsed] = useState(() => performance.now() - receivedAt);
  useEffect(() => {
    const update = () => setElapsed(performance.now() - receivedAt);
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [receivedAt]);
  const seconds = responseRemainingSeconds(serverTime, expiresAt, elapsed);
  const minutes = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <AppText muted>
      {seconds > 0 ? text.timeRemaining(minutes) : text.awaitingOrderUpdate}
    </AppText>
  );
}

function OrderHistory({
  request,
  onSelect,
  currencyDisplayMode,
}: OrdersScreenProps) {
  const history = useOrderRead(
    request,
    "/customer/orders",
    orderListResponseSchema,
  );
  const mode = history.data?.currencyDisplayMode ?? currencyDisplayMode;
  return (
    <ScrollScreen>
      <AppText title accessibilityRole="header">
        {text.history}
      </AppText>
      <Status
        busy={history.loading && !history.data}
        error={history.error}
        message={staleCopy(history.error, history.updatedAt)}
        retry={history.refresh}
      />
      {history.data && (
        <Button
          label={text.refresh}
          disabled={history.loading}
          onPress={() => void history.refresh()}
        />
      )}
      {history.data?.orders.length === 0 && (
        <AppText muted>{text.empty}</AppText>
      )}
      {history.data?.orders.map((order) => (
        <View key={order.id} style={styles.card}>
          <AppText title>
            {order.restaurantName ?? text.restaurantFallback}
          </AppText>
          <AppText>{text.orderNumber(order.orderNumber)}</AppText>
          <AppText>{text.statuses[order.status]}</AppText>
          <AppText muted>{formatDamascusDateTime(order.createdAt)}</AppText>
          {order.totalMinor !== undefined && (
            <AppText>{formatMoney(order.totalMinor, mode)}</AppText>
          )}
          <Button label={text.details} onPress={() => onSelect(order.id)} />
        </View>
      ))}
    </ScrollScreen>
  );
}

function OrderContents({
  order,
  currencyDisplayMode,
}: {
  order: OrderReadResponse;
  currencyDisplayMode: DisplayMode;
}) {
  return (
    <>
      <View style={styles.card}>
        <AppText title accessibilityRole="header">
          {text.timeline}
        </AppText>
        {order.events.length === 0 && (
          <AppText>{text.statuses[order.status]}</AppText>
        )}
        {order.events.map((event) => (
          <View key={event.id} style={styles.field}>
            <AppText>{text.statuses[event.to]}</AppText>
            <AppText muted>{formatDamascusDateTime(event.createdAt)}</AppText>
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <AppText title accessibilityRole="header">
          {text.items}
        </AppText>
        {order.items.map((item) => (
          <View key={item.id} style={styles.field}>
            <AppText>{item.name}</AppText>
            {item.sizeName !== messages.menu.regularSize && (
              <AppText muted>{item.sizeName}</AppText>
            )}
            <AppText muted>{text.quantity(item.quantity)}</AppText>
            {item.options.map((option) => (
              <AppText key={option.id} muted>
                {option.name}
              </AppText>
            ))}
            {item.note && <AppText muted>{item.note}</AppText>}
            {item.totalMinor !== undefined && (
              <AppText>
                {formatMoney(item.totalMinor, currencyDisplayMode)}
              </AppText>
            )}
          </View>
        ))}
        {order.note && <AppText muted>{order.note}</AppText>}
        {order.totalMinor !== undefined && (
          <View style={styles.row}>
            <AppText>{text.total}</AppText>
            <AppText>
              {formatMoney(order.totalMinor, currencyDisplayMode)}
            </AppText>
          </View>
        )}
      </View>
    </>
  );
}

function OrderTracking({
  request,
  selectedId,
  onSelect,
  currencyDisplayMode,
}: OrdersScreenProps & { selectedId: string }) {
  const path = `/customer/orders/${selectedId}`;
  const tracking = useOrderRead(request, path, orderReadSchema);
  const order = tracking.data;
  const shouldPoll = order === undefined || !TERMINAL_STATES.has(order.status);
  const { refresh } = tracking;
  const [foreground, setForeground] = useState(
    () => AppState.currentState === "active" || AppState.currentState === null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const cancelling = useRef(false);

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!shouldPoll || !foreground) return;
    void refresh();
    const timer = setInterval(() => void refresh(), pollInterval);
    return () => clearInterval(timer);
  }, [foreground, refresh, shouldPoll]);

  async function cancel() {
    if (cancelling.current) return;
    cancelling.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const cancelled = await request(
        `${path}/cancel`,
        { method: "POST" },
        orderReadSchema,
      );
      tracking.replace({
        ...cancelled,
        currencyDisplayMode:
          cancelled.currencyDisplayMode ?? order?.currencyDisplayMode,
      });
    } catch (cause) {
      setError(serviceError(cause));
      await refresh();
    } finally {
      cancelling.current = false;
      setBusy(false);
    }
  }

  const number = normalizeSyrianPhone(order?.restaurantPhone ?? "");
  const estimate =
    order?.type === "PICKUP"
      ? order.estimatedReadyAt
      : order?.estimatedDeliveryAt;
  const canCancel =
    order &&
    canTransition(order.status, "CANCELLED", { type: "CUSTOMER" }, order.type);
  return (
    <ScrollScreen>
      <Button label={text.back} onPress={() => onSelect()} />
      <AppText title accessibilityRole="header">
        {text.details}
      </AppText>
      <Status
        busy={tracking.loading && !order}
        error={tracking.error}
        message={staleCopy(tracking.error, tracking.updatedAt)}
        retry={refresh}
      />
      {order && (
        <>
          <View style={styles.card}>
            <AppText title>{text.orderNumber(order.orderNumber)}</AppText>
            <AppText>{order.restaurantName ?? text.restaurantFallback}</AppText>
            <AppText accessibilityLiveRegion="polite">
              {text.statuses[order.status]}
            </AppText>
            {order.status === "PENDING" &&
              order.serverTime &&
              order.pendingExpiresAt &&
              tracking.receivedAt !== undefined && (
                <ResponseCountdown
                  serverTime={order.serverTime}
                  expiresAt={order.pendingExpiresAt}
                  receivedAt={tracking.receivedAt}
                />
              )}
            {estimate && !TERMINAL_STATES.has(order.status) && (
              <AppText muted>
                {order.type === "PICKUP"
                  ? text.estimatePickup(formatDamascusDateTime(estimate))
                  : text.estimateDelivery(formatDamascusDateTime(estimate))}
              </AppText>
            )}
            <View style={styles.row}>
              {canCancel && (
                <Button
                  label={text.cancelOrder}
                  disabled={busy}
                  onPress={() =>
                    Alert.alert(text.cancelOrder, text.cancelPrompt, [
                      { text: text.keepOrder, style: "cancel" },
                      {
                        text: text.cancelOrder,
                        style: "destructive",
                        onPress: () => void cancel(),
                      },
                    ])
                  }
                />
              )}
              {number && (
                <Button
                  label={`${text.callRestaurant} · ${number}`}
                  onPress={() => {
                    setError(undefined);
                    void Linking.openURL(`tel:${number}`).catch(() =>
                      setError(text.callFailed),
                    );
                  }}
                />
              )}
            </View>
            <Status busy={busy} error={error} />
          </View>
          <OrderContents
            order={order}
            currencyDisplayMode={
              order.currencyDisplayMode ?? currencyDisplayMode
            }
          />
          <OrderComplaint order={order} request={request} />
        </>
      )}
    </ScrollScreen>
  );
}

export function OrdersScreen(props: OrdersScreenProps) {
  return props.selectedId ? (
    <OrderTracking
      {...props}
      selectedId={props.selectedId}
      key={props.selectedId}
    />
  ) : (
    <OrderHistory {...props} />
  );
}
