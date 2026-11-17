import {
  branchAcceptingOrdersResponseSchema,
  orderListResponseSchema,
  orderReadSchema,
  type OrderReadResponse,
} from "@be-fast/contracts";
import {
  formatMoney,
  maskPhone,
  type DisplayMode,
  type OrderStatus,
  type RestaurantRole,
} from "@be-fast/domain";
import {
  formatDamascusDateTime,
  restaurantOrders as text,
} from "@be-fast/i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FlatList, Pressable, Switch, Text, View } from "react-native";
import type { RestaurantRequest } from "../api";
import { useOrderPolling } from "./poll";
import { styles } from "./styles";
import {
  OrderButton,
  OrderDetail,
  responseCountdown,
  type Transition,
} from "./view";

type Tab = keyof typeof text.tabs;
export interface OrderConnection {
  offline: boolean;
  lastUpdatedAt?: string;
}

const tabs: readonly Tab[] = [
  "new",
  "preparing",
  "ready",
  "delivering",
  "completed",
];
const statuses: Record<Tab, readonly OrderStatus[]> = {
  new: ["PENDING"],
  preparing: ["ACCEPTED", "PREPARING"],
  ready: ["READY"],
  delivering: ["OUT_FOR_DELIVERY"],
  completed: ["DELIVERED"],
};
const damascusDay = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Damascus",
});
const privacyWindowMs = 24 * 60 * 60 * 1000;

function dayInDamascus(instant: number) {
  const values = new Map(
    damascusDay.formatToParts(instant).map(({ type, value }) => [type, value]),
  );
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function applyCachedPrivacy(order: OrderReadResponse, serverNow: number) {
  if (
    order.finishedAt === null ||
    serverNow - Date.parse(order.finishedAt) < privacyWindowMs
  )
    return order;
  const phone = order.customerPhone;
  return {
    ...order,
    customerName: null,
    customerPhone: phone
      ? phone.includes("•")
        ? phone
        : maskPhone(phone)
      : phone,
    addressSnapshot: null,
  };
}

function useServerClock(foreground: boolean, offset: number) {
  const [current, setCurrent] = useState(Date.now);
  useEffect(() => {
    if (!foreground) return;
    const timer = setInterval(() => setCurrent(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [foreground]);
  return current + offset;
}

function OrderRow({
  order,
  role,
  mode,
  serverNow,
  expireAfterSec,
  unseen,
  onOpen,
}: {
  order: OrderReadResponse;
  role: RestaurantRole;
  mode: DisplayMode;
  serverNow: number;
  expireAfterSec: number;
  unseen: boolean;
  onOpen: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      testID={`order-row-${order.id}`}
      style={[styles.panel, unseen && styles.highlighted]}
    >
      <View style={styles.spread}>
        <Text style={styles.heading}>{order.orderNumber}</Text>
        <Text style={styles.detail}>{text.status[order.status]}</Text>
      </View>
      <Text style={styles.text}>{text.type[order.type]}</Text>
      {unseen && <Text style={styles.error}>{text.newOrder}</Text>}
      {order.status === "PENDING" && (
        <Text style={styles.text}>
          {text.remaining}{" "}
          {responseCountdown(order.createdAt, expireAfterSec, serverNow)}
        </Text>
      )}
      {role !== "KITCHEN" && order.totalMinor !== undefined && (
        <Text style={styles.text}>{formatMoney(order.totalMinor, mode)}</Text>
      )}
    </Pressable>
  );
}

export function OrderConsole({
  role,
  mode,
  expireAfterSec,
  serverOffsetMs,
  acceptingOrders,
  foreground,
  connected,
  visible = true,
  onConnectionChange,
  request,
  alert,
}: {
  role: RestaurantRole;
  mode: DisplayMode;
  expireAfterSec: number;
  serverOffsetMs: number;
  acceptingOrders: boolean;
  foreground: boolean;
  connected: boolean;
  visible?: boolean;
  onConnectionChange?: (connection: OrderConnection) => void;
  request: RestaurantRequest;
  alert?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("new");
  const [viewed, setViewed] = useState<ReadonlySet<string>>(() => new Set());
  const [opened, setOpened] = useState<OrderReadResponse | null>(null);
  const [branchUpdate, setBranchUpdate] = useState<boolean | undefined>();
  const [pauseFailed, setPauseFailed] = useState(false);
  const [pauseSaving, setPauseSaving] = useState(false);
  const pauseInFlight = useRef(false);
  const serverNow = useServerClock(foreground && visible, serverOffsetMs);
  const canReadDetails = foreground && connected && visible;
  const active = useOrderPolling(
    "/restaurant/orders/active",
    orderListResponseSchema,
    request,
    foreground,
    !connected,
  );
  const completedPath =
    tab === "completed"
      ? `/restaurant/orders?status=DELIVERED&finishedOn=${dayInDamascus(serverNow)}`
      : null;
  const completed = useOrderPolling(
    completedPath,
    orderListResponseSchema,
    request,
    canReadDetails,
  );
  const detail = useOrderPolling(
    opened ? `/restaurant/orders/${opened.id}` : null,
    orderReadSchema,
    request,
    canReadDetails,
  );
  const isOffline = !connected || active.failed;
  const lastUpdatedAt =
    active.receivedAt === undefined
      ? undefined
      : new Date(active.receivedAt + serverOffsetMs).toISOString();
  useEffect(() => {
    onConnectionChange?.({ offline: isOffline, lastUpdatedAt });
  }, [isOffline, lastUpdatedAt, onConnectionChange]);
  const isAccepting = branchUpdate ?? acceptingOrders;
  const activeOrders = active.data?.orders ?? [];
  const tabResource = tab === "completed" ? completed : active;
  const tabOrders = (tabResource.data?.orders ?? []).filter(({ status }) =>
    statuses[tab].includes(status),
  );
  const newerDetail =
    detail.data && opened && detail.data.events.length >= opened.events.length
      ? detail.data
      : opened;
  const selected = newerDetail
    ? applyCachedPrivacy(newerDetail, serverNow)
    : null;
  const hasUnseen = activeOrders.some(
    ({ id, status }) => status === "PENDING" && !viewed.has(id),
  );

  function open(order: OrderReadResponse) {
    setViewed((previous) => new Set([...previous, order.id]));
    setOpened(order);
  }

  async function transition(body: Transition) {
    if (!selected) return;
    const { id } = selected;
    const updated = await request(
      `/restaurant/orders/${id}/transition`,
      { method: "POST", body },
      orderReadSchema,
    );
    setOpened((previous) => (previous?.id === id ? updated : previous));
    active.refresh();
    detail.refresh();
    completed.refresh();
  }

  async function updatePause(pause: boolean) {
    if (pauseInFlight.current || isOffline || role === "KITCHEN") return;
    pauseInFlight.current = true;
    setPauseSaving(true);
    setPauseFailed(false);
    try {
      const updated = await request(
        "/restaurant/branch/accepting-orders",
        { method: "PATCH", body: { acceptingOrders: !pause } },
        branchAcceptingOrdersResponseSchema,
      );
      setBranchUpdate(updated.acceptingOrders);
    } catch {
      setPauseFailed(true);
    } finally {
      pauseInFlight.current = false;
      setPauseSaving(false);
    }
  }

  const audibleAlert = foreground && connected && hasUnseen && alert;
  return (
    <>
      {audibleAlert}
      {visible && (
        <View style={styles.screen}>
          <View style={styles.toolbar}>
            <Text accessibilityRole="header" style={styles.title}>
              {text.title}
            </Text>
            {role !== "KITCHEN" && (
              <View style={styles.panel}>
                <View style={styles.spread}>
                  <View>
                    <Text style={styles.text}>{text.pause}</Text>
                    <Text style={styles.muted}>
                      {isAccepting ? text.receiving : text.paused}
                    </Text>
                  </View>
                  <View style={styles.switch}>
                    <Switch
                      testID="accepting-orders-switch"
                      accessibilityLabel={text.pause}
                      value={!isAccepting}
                      disabled={pauseSaving || isOffline}
                      onValueChange={(value) => {
                        void updatePause(value);
                      }}
                    />
                  </View>
                </View>
                {pauseFailed && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {text.requestError}
                  </Text>
                )}
              </View>
            )}
            {!selected && (
              <View style={styles.row}>
                {tabs.map((name) => (
                  <OrderButton
                    key={name}
                    label={text.tabs[name]}
                    selected={tab === name}
                    onPress={() => setTab(name)}
                  />
                ))}
              </View>
            )}
          </View>
          {isOffline && (
            <View
              accessibilityLiveRegion="polite"
              testID="orders-offline"
              style={styles.banner}
            >
              <Text style={styles.error}>{text.offline}</Text>
              <Text style={styles.text}>
                {lastUpdatedAt === undefined
                  ? text.noUpdate
                  : `${text.lastUpdated} ${formatDamascusDateTime(lastUpdatedAt)}`}
              </Text>
              <OrderButton label={text.retry} onPress={active.refresh} />
            </View>
          )}
          {selected ? (
            <OrderDetail
              key={selected.id}
              order={selected}
              role={role}
              mode={mode}
              isOffline={isOffline}
              serverNow={serverNow}
              expireAfterSec={expireAfterSec}
              onClose={() => setOpened(null)}
              onTransition={transition}
            />
          ) : (
            <FlatList
              contentContainerStyle={styles.content}
              data={tabOrders}
              keyExtractor={(order) => order.id}
              renderItem={({ item }) => (
                <OrderRow
                  order={item}
                  role={role}
                  mode={mode}
                  serverNow={serverNow}
                  expireAfterSec={expireAfterSec}
                  unseen={item.status === "PENDING" && !viewed.has(item.id)}
                  onOpen={() => open(item)}
                />
              )}
              ListEmptyComponent={
                <Text style={styles.muted}>
                  {tabResource.loading ? text.loading : text.empty}
                </Text>
              }
              ListHeaderComponent={
                tabResource.failed && tab === "completed" ? (
                  <View style={styles.banner}>
                    <Text style={styles.error}>
                      {tabResource.data ? text.stale : text.requestError}
                    </Text>
                    <OrderButton
                      label={text.retry}
                      onPress={completed.refresh}
                    />
                  </View>
                ) : undefined
              }
            />
          )}
        </View>
      )}
    </>
  );
}
