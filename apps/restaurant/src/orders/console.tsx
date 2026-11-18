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
import { enterUp, Icon, PressableScale, Pulse } from "@be-fast/ui-native";
import { darkColors as colors } from "@be-fast/ui-tokens";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BackHandler, FlatList, ScrollView, Switch, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import type { RestaurantRequest } from "../api";
import { useOrderPolling } from "./poll";
import { styles } from "./styles";
import {
  OrderButton,
  OrderDetail,
  responseCountdown,
  statusLook,
  StatusPill,
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
  index,
  onOpen,
}: {
  order: OrderReadResponse;
  role: RestaurantRole;
  mode: DisplayMode;
  serverNow: number;
  expireAfterSec: number;
  unseen: boolean;
  index: number;
  onOpen: () => void;
}) {
  const look = statusLook[order.status];
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <Animated.View entering={enterUp(index)}>
      <Pulse active={unseen}>
        <PressableScale
          accessibilityRole="button"
          onPress={onOpen}
          testID={`order-row-${order.id}`}
          pressedScale={0.98}
          style={[styles.panel, styles.orderCard, unseen && styles.highlighted]}
        >
          <View style={[styles.strip, { backgroundColor: look.color }]} />
          <View style={styles.spread}>
            <Text style={styles.orderNumber}>{order.orderNumber}</Text>
            {unseen ? (
              <View style={styles.newBadge}>
                <Icon name="bell" size={14} color={colors.onBrand} strokeWidth={2.4} />
                <Text style={styles.newBadgeText}>{text.newOrder}</Text>
              </View>
            ) : (
              <StatusPill status={order.status} label={text.status[order.status]} />
            )}
          </View>
          <View style={styles.row}>
            <View style={styles.inline}>
              <Icon
                name={order.type === "PICKUP" ? "store" : "scooter"}
                size={18}
                color={colors.mutedInk}
              />
              <Text style={styles.text}>{text.type[order.type]}</Text>
            </View>
            <View style={styles.inline}>
              <Icon name="bag" size={18} color={colors.mutedInk} />
              <Text style={styles.text}>{itemCount}</Text>
            </View>
            {role !== "KITCHEN" && order.totalMinor !== undefined && (
              <Text style={[styles.detail, styles.numericText]}>
                {formatMoney(order.totalMinor, mode)}
              </Text>
            )}
          </View>
          {order.status === "PENDING" && (
            <View style={styles.inline}>
              <Icon name="clock" size={18} color={colors.warning} />
              <Text style={styles.warning}>
                {text.remaining}{" "}
                {responseCountdown(order.createdAt, expireAfterSec, serverNow)}
              </Text>
            </View>
          )}
        </PressableScale>
      </Pulse>
    </Animated.View>
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
  onBackFromList,
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
  onBackFromList?: () => void;
  request: RestaurantRequest;
  alert?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("new");
  const [viewed, setViewed] = useState<ReadonlySet<string>>(() => new Set());
  const [opened, setOpened] = useState<OrderReadResponse | null>(null);
  const detailOpen = opened !== null;
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
  useEffect(() => {
    if (!foreground || !visible || (!detailOpen && !onBackFromList)) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (detailOpen) setOpened(null);
      else onBackFromList?.();
      return true;
    });
    return () => subscription.remove();
  }, [detailOpen, foreground, onBackFromList, visible]);
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
              <View
                style={[
                  styles.panel,
                  {
                    backgroundColor: isAccepting ? colors.successSoft : colors.warningSoft,
                    borderColor: isAccepting ? colors.success : colors.warning,
                  },
                ]}
              >
                <View style={styles.spread}>
                  <View style={styles.inline}>
                    <Pulse active={isAccepting}>
                      <Icon
                        name={isAccepting ? "bolt" : "pause"}
                        size={24}
                        color={isAccepting ? colors.success : colors.warning}
                      />
                    </Pulse>
                    <View>
                      <Text style={styles.heading}>{text.pause}</Text>
                      <Text style={[styles.muted, { color: isAccepting ? colors.success : colors.warning }]}>
                        {isAccepting ? text.receiving : text.paused}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.switch}>
                    <Switch
                      trackColor={{ false: colors.subtleBorder, true: colors.brandStrong }}
                      thumbColor={colors.ink}
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
          </View>
          {!selected && (
            <View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabs}
              >
                {tabs.map((name) => {
                  const active = tab === name;
                  return (
                    <PressableScale
                      key={name}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setTab(name)}
                      style={[styles.tab, active && styles.tabActive]}
                    >
                      <Text
                        style={[
                          styles.buttonText,
                          { color: active ? colors.onBrand : colors.mutedInk },
                        ]}
                      >
                        {text.tabs[name]}
                      </Text>
                    </PressableScale>
                  );
                })}
              </ScrollView>
            </View>
          )}
          {isOffline && (
            <View
              accessibilityLiveRegion="polite"
              testID="orders-offline"
              style={styles.banner}
            >
              <View style={styles.inline}>
                <Icon name="wifiOff" size={20} color={colors.danger} />
                <Text style={styles.error}>{text.offline}</Text>
              </View>
              <Text style={styles.text}>
                {lastUpdatedAt === undefined
                  ? text.noUpdate
                  : `${text.lastUpdated} ${formatDamascusDateTime(lastUpdatedAt)}`}
              </Text>
              <OrderButton label={text.retry} onPress={active.refresh} icon="refresh" />
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
              renderItem={({ item, index }) => (
                <OrderRow
                  index={index}
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
                <View style={styles.empty}>
                  <View style={styles.emptyIcon}>
                    <Icon name="receipt" size={38} color={colors.mutedInk} strokeWidth={1.6} />
                  </View>
                  <Text style={styles.muted}>
                    {tabResource.loading ? text.loading : text.empty}
                  </Text>
                </View>
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
