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
import { enterUp, Icon, PressableScale, Pulse, type IconName } from "@be-fast/ui-native";
import { colors, radius, spacing } from "@be-fast/ui-tokens";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { serviceError, type CustomerRequest } from "../api";
import {
  AppText,
  Button,
  Card,
  Divider,
  EmptyState,
  InfoRow,
  Pill,
  ScreenHeader,
  ScrollScreen,
  SectionTitle,
  Status,
  styles,
} from "../ui";
import { responseRemainingSeconds } from "./countdown";
import { OrderComplaint } from "./order-complaint";
import { useOrderRead } from "./use-order-read";

const pollInterval = 15_000;

type OrderStatus = OrderReadResponse["status"];
type Tone = "warning" | "brand" | "info" | "success" | "danger";

const statusLook: Record<OrderStatus, { icon: IconName; tone: Tone }> = {
  PENDING: { icon: "clock", tone: "warning" },
  ACCEPTED: { icon: "check", tone: "info" },
  PREPARING: { icon: "chef", tone: "brand" },
  READY: { icon: "box", tone: "brand" },
  OUT_FOR_DELIVERY: { icon: "scooter", tone: "brand" },
  DELIVERED: { icon: "check", tone: "success" },
  REJECTED: { icon: "close", tone: "danger" },
  EXPIRED: { icon: "clock", tone: "danger" },
  CANCELLED: { icon: "close", tone: "danger" },
  DELIVERY_FAILED: { icon: "alert", tone: "danger" },
};

const toneColors: Record<Tone, { soft: string; strong: string }> = {
  warning: { soft: colors.warningSoft, strong: colors.warning },
  brand: { soft: colors.brandTint, strong: colors.brandText },
  info: { soft: colors.infoSoft, strong: colors.info },
  success: { soft: colors.successSoft, strong: colors.success },
  danger: { soft: colors.dangerSoft, strong: colors.danger },
};

const deliverySteps: readonly OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];
const pickupSteps: readonly OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "DELIVERED",
];

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
    <Pill
      icon="clock"
      tone="warning"
      label={seconds > 0 ? text.timeRemaining(minutes) : text.awaitingOrderUpdate}
    />
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const look = statusLook[status];
  return <Pill label={text.statuses[status]} icon={look.icon} tone={look.tone} />;
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
      <ScreenHeader
        title={text.history}
        accessory={
          history.data ? (
            <Button
              label={text.refresh}
              icon="refresh"
              variant="soft"
              compact
              disabled={history.loading}
              onPress={() => void history.refresh()}
            />
          ) : undefined
        }
      />
      <Status
        busy={history.loading && !history.data}
        error={history.error}
        message={staleCopy(history.error, history.updatedAt)}
        retry={history.refresh}
      />
      {history.data?.orders.length === 0 && (
        <EmptyState icon="receipt" title={text.empty} />
      )}
      {history.data?.orders.map((order, index) => {
        const look = statusLook[order.status];
        const tone = toneColors[look.tone];
        return (
          <Animated.View key={order.id} entering={enterUp(index)}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={text.details}
              onPress={() => onSelect(order.id)}
              pressedScale={0.98}
              style={[styles.card, local.orderCard]}
            >
              <View style={[local.orderIcon, { backgroundColor: tone.soft }]}>
                <Icon name={look.icon} size={24} color={tone.strong} />
              </View>
              <View style={local.orderBody}>
                <AppText variant="title" numberOfLines={1}>
                  {order.restaurantName ?? text.restaurantFallback}
                </AppText>
                <AppText variant="small" muted>
                  {text.orderNumber(order.orderNumber)} ·{" "}
                  {formatDamascusDateTime(order.createdAt)}
                </AppText>
                <StatusPill status={order.status} />
              </View>
              <View style={local.orderEnd}>
                {order.totalMinor !== undefined && (
                  <AppText weight="bold" style={styles.numeric}>
                    {formatMoney(order.totalMinor, mode)}
                  </AppText>
                )}
                <Icon name="forward" size={20} color={colors.mutedInk} />
              </View>
            </PressableScale>
          </Animated.View>
        );
      })}
    </ScrollScreen>
  );
}

function Progress({ order }: { order: OrderReadResponse }) {
  const steps = order.type === "PICKUP" ? pickupSteps : deliverySteps;
  const failed = !steps.includes(order.status);
  const reached = new Map(order.events.map((event) => [event.to, event.createdAt]));
  const currentIndex = failed
    ? Math.max(
        0,
        ...steps.map((step, index) => (reached.has(step) ? index : 0)),
      )
    : steps.indexOf(order.status);
  return (
    <View style={local.timeline}>
      {steps.map((step, index) => {
        const done = index < currentIndex || (!failed && index === currentIndex && order.status === "DELIVERED");
        const current = !failed && index === currentIndex && order.status !== "DELIVERED";
        const at = reached.get(step);
        return (
          <View key={step} style={local.step}>
            <View style={local.rail}>
              {current ? (
                <Pulse style={[local.dot, local.dotCurrent]}>
                  <Icon name={statusLook[step].icon} size={14} color={colors.onBrand} strokeWidth={2.6} />
                </Pulse>
              ) : (
                <View style={[local.dot, done ? local.dotDone : local.dotTodo]}>
                  {done && <Icon name="check" size={14} color={colors.onBrand} strokeWidth={3} />}
                </View>
              )}
              {index < steps.length - 1 && (
                <View style={[local.line, index < currentIndex ? local.lineDone : null]} />
              )}
            </View>
            <View style={local.stepText}>
              <AppText
                weight={current ? "bold" : done ? "semibold" : "regular"}
                muted={!current && !done}
                tone={current ? "brand" : undefined}
              >
                {text.statuses[step]}
              </AppText>
              {at && (
                <AppText variant="caption" muted>
                  {formatDamascusDateTime(at)}
                </AppText>
              )}
            </View>
          </View>
        );
      })}
      {failed && (
        <View style={local.step}>
          <View style={local.rail}>
            <View style={[local.dot, local.dotFailed]}>
              <Icon name="close" size={14} color={colors.onBrand} strokeWidth={3} />
            </View>
          </View>
          <View style={local.stepText}>
            <AppText weight="bold" tone="danger">
              {text.statuses[order.status]}
            </AppText>
            {reached.get(order.status) && (
              <AppText variant="caption" muted>
                {formatDamascusDateTime(reached.get(order.status) ?? "")}
              </AppText>
            )}
          </View>
        </View>
      )}
    </View>
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
      <Card>
        <SectionTitle title={text.timeline} icon="list" />
        <Progress order={order} />
      </Card>
      <Card>
        <SectionTitle title={text.items} icon="receipt" />
        {order.items.map((item) => (
          <View key={item.id} style={local.item}>
            <View style={local.qty}>
              <AppText variant="small" weight="bold" tone="brand">
                {item.quantity}×
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText weight="semibold">{item.name}</AppText>
              {item.sizeName !== messages.menu.regularSize && (
                <AppText variant="small" muted>
                  {item.sizeName}
                </AppText>
              )}
              {item.options.length > 0 && (
                <AppText variant="small" muted>
                  {item.options.map((option) => option.name).join(" · ")}
                </AppText>
              )}
              {item.note && (
                <AppText variant="small" muted>
                  {item.note}
                </AppText>
              )}
              <AppText variant="caption" muted>
                {text.quantity(item.quantity)}
              </AppText>
            </View>
            {item.totalMinor !== undefined && (
              <AppText weight="semibold" style={styles.numeric}>
                {formatMoney(item.totalMinor, currencyDisplayMode)}
              </AppText>
            )}
          </View>
        ))}
        {order.note && (
          <View style={styles.inline}>
            <Icon name="note" size={16} color={colors.mutedInk} />
            <AppText variant="small" muted style={styles.flex}>
              {order.note}
            </AppText>
          </View>
        )}
        {order.totalMinor !== undefined && (
          <>
            <Divider />
            <InfoRow
              label={text.total}
              value={formatMoney(order.totalMinor, currencyDisplayMode)}
              strong
            />
          </>
        )}
      </Card>
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
  const look = order ? statusLook[order.status] : undefined;
  const tone = look ? toneColors[look.tone] : undefined;
  return (
    <ScrollScreen>
      <ScreenHeader
        title={text.details}
        subtitle={order ? text.orderNumber(order.orderNumber) : undefined}
        onBack={() => onSelect()}
      />
      <Status
        busy={tracking.loading && !order}
        error={tracking.error}
        message={staleCopy(tracking.error, tracking.updatedAt)}
        retry={refresh}
      />
      {order && look && tone && (
        <>
          <Animated.View entering={enterUp(0)} style={[local.hero, { backgroundColor: tone.soft }]}>
            <Pulse active={!TERMINAL_STATES.has(order.status)} style={[local.heroIcon, { backgroundColor: tone.strong }]}>
              <Icon name={look.icon} size={34} color={colors.onBrand} />
            </Pulse>
            <AppText
              variant="title"
              center
              accessibilityLiveRegion="polite"
              style={{ color: tone.strong }}
            >
              {text.statuses[order.status]}
            </AppText>
            <AppText muted center>
              {order.restaurantName ?? text.restaurantFallback}
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
              <Pill
                icon={order.type === "PICKUP" ? "store" : "scooter"}
                tone="brand"
                label={
                  order.type === "PICKUP"
                    ? text.estimatePickup(formatDamascusDateTime(estimate))
                    : text.estimateDelivery(formatDamascusDateTime(estimate))
                }
              />
            )}
          </Animated.View>
          {(canCancel || number) && (
            <View style={local.actions}>
              {number && (
                <View style={styles.flex}>
                  <Button
                    label={`${text.callRestaurant} · ${number}`}
                    icon="phone"
                    variant="soft"
                    onPress={() => {
                      setError(undefined);
                      void Linking.openURL(`tel:${number}`).catch(() =>
                        setError(text.callFailed),
                      );
                    }}
                  />
                </View>
              )}
              {canCancel && (
                <View style={styles.flex}>
                  <Button
                    label={text.cancelOrder}
                    icon="close"
                    variant="danger"
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
                </View>
              )}
            </View>
          )}
          <Status busy={busy} error={error} />
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

const local = StyleSheet.create({
  orderCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  orderIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  orderBody: { flex: 1, gap: spacing.xs },
  orderEnd: { alignItems: "flex-end", gap: spacing.sm },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  heroIcon: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  timeline: { gap: 0 },
  step: { flexDirection: "row", gap: spacing.md, minHeight: 56 },
  rail: { alignItems: "center", width: 28 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dotDone: { backgroundColor: colors.success },
  dotCurrent: { backgroundColor: colors.brandStrong },
  dotTodo: {
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderColor: colors.subtleBorder,
  },
  dotFailed: { backgroundColor: colors.danger },
  line: { flex: 1, width: 3, borderRadius: 2, backgroundColor: colors.subtleBorder, marginVertical: 2 },
  lineDone: { backgroundColor: colors.success },
  stepText: { flex: 1, paddingTop: 2, paddingBottom: spacing.md },
  item: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  qty: {
    minWidth: 34,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.brandTint,
    alignItems: "center",
  },
});
