import type { OrderReadResponse } from "@be-fast/contracts";
import { restaurantOrderTransitionSchema } from "@be-fast/contracts";
import {
  CANCELLATION_REASON_CODES,
  DELIVERY_FAILURE_REASON_CODES,
  REJECTION_REASON_CODES,
  allowedTransitions,
  formatMoney,
  type DisplayMode,
  type OrderStatus,
  type RestaurantRole,
} from "@be-fast/domain";
import { messages, restaurantOrders as text } from "@be-fast/i18n";
import { useRef, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { styles } from "./styles";

export type Transition = ReturnType<
  typeof restaurantOrderTransitionSchema.parse
>;
type ReasonCode = NonNullable<Transition["reasonCode"]>;
const prepTimes = [10, 15, 20, 30, 45, 60];
const reasons: Partial<Record<OrderStatus, readonly ReasonCode[]>> = {
  REJECTED: REJECTION_REASON_CODES,
  CANCELLED: CANCELLATION_REASON_CODES,
  DELIVERY_FAILED: DELIVERY_FAILURE_REASON_CODES,
};

export function OrderButton({
  label,
  onPress,
  disabled = false,
  selected,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        selected && styles.activeButton,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function responseCountdown(
  createdAt: string,
  expireAfterSec: number,
  serverNow: number,
) {
  const seconds = Math.max(
    0,
    Math.ceil(
      (Date.parse(createdAt) + expireAfterSec * 1000 - serverNow) / 1000,
    ),
  );
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function OrderCustomer({
  order,
  reportError,
}: {
  order: OrderReadResponse;
  reportError: () => void;
}) {
  const address = [
    "governorateName",
    "cityName",
    "neighborhoodName",
    "street",
    "landmark",
    "building",
    "floor",
    "notes",
  ]
    .map((field) => order.addressSnapshot?.[field])
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
  const phone = order.customerPhone;
  if (!order.customerName && !phone && address.length === 0) return null;
  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>{text.customer}</Text>
      {order.customerName && (
        <Text style={styles.detail}>{order.customerName}</Text>
      )}
      {phone && (
        <Text testID="order-customer-phone" style={styles.detail}>
          {phone}
        </Text>
      )}
      {address.length > 0 && (
        <Text testID="order-customer-address" style={styles.detail}>
          {address.join("، ")}
        </Text>
      )}
      {phone && /^\+9639\d{8}$/u.test(phone) && (
        <OrderButton
          label={text.call}
          onPress={() => {
            void Linking.openURL(`tel:${phone}`).catch(reportError);
          }}
        />
      )}
    </View>
  );
}

function OrderAmounts({
  order,
  mode,
}: {
  order: OrderReadResponse;
  mode: DisplayMode;
}) {
  const amounts = [
    { label: text.foodSubtotal, value: order.foodSubtotalMinor },
    { label: text.deliveryFee, value: order.deliveryFeeMinor },
    { label: text.total, value: order.totalMinor },
  ];
  if (amounts.every(({ value }) => value === undefined)) return null;
  return (
    <View style={styles.panel} testID="order-amounts">
      {amounts.map(({ label, value }) =>
        value === undefined ? null : (
          <View style={styles.spread} key={label}>
            <Text style={styles.text}>{label}</Text>
            <Text style={styles.detail}>{formatMoney(value, mode)}</Text>
          </View>
        ),
      )}
    </View>
  );
}

export function OrderDetail({
  order,
  role,
  mode,
  isOffline,
  serverNow,
  expireAfterSec,
  onClose,
  onTransition,
}: {
  order: OrderReadResponse;
  role: RestaurantRole;
  mode: DisplayMode;
  isOffline: boolean;
  serverNow: number;
  expireAfterSec: number;
  onClose: () => void;
  onTransition: (fields: Transition) => Promise<void>;
}) {
  const [choice, setChoice] = useState<OrderStatus | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const writing = useRef(false);
  const targets = allowedTransitions(
    order.status,
    { type: "RESTAURANT", role },
    order.type,
  );
  const selectedChoice =
    choice !== null && targets.includes(choice) ? choice : null;

  async function submit(fields: Transition) {
    if (writing.current || isOffline || !targets.includes(fields.to)) return;
    writing.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await onTransition(fields);
      setChoice(null);
      setNote("");
    } catch {
      setFailed(true);
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }

  function choose(to: OrderStatus) {
    setFailed(false);
    if (to === "ACCEPTED" || reasons[to]) {
      setNote("");
      setChoice(to);
    } else {
      void submit({ to });
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.row}>
        <OrderButton label={text.returnToOrders} onPress={onClose} />
        <Text accessibilityRole="header" style={styles.title}>
          {order.orderNumber}
        </Text>
      </View>
      <View style={styles.panel}>
        <Text style={styles.heading}>
          {text.status[order.status]} · {text.type[order.type]}
        </Text>
        {order.status === "PENDING" && (
          <Text style={styles.error}>
            {text.remaining}{" "}
            {responseCountdown(order.createdAt, expireAfterSec, serverNow)}
          </Text>
        )}
        {order.note && <Text style={styles.detail}>{order.note}</Text>}
      </View>
      <View style={styles.panel}>
        <Text style={styles.heading}>{text.items}</Text>
        {order.items.map((item) => (
          <View key={item.id}>
            <Text style={styles.detail}>
              {item.name}
              {item.sizeName === messages.menu.regularSize
                ? ""
                : ` ${item.sizeName}`}{" "}
              × {item.quantity}
            </Text>
            {item.options.map((option) => (
              <Text key={option.id} style={styles.text}>
                {option.name}
              </Text>
            ))}
            {item.note && <Text style={styles.text}>{item.note}</Text>}
          </View>
        ))}
      </View>
      {role === "KITCHEN" ? (
        order.customerName && (
          <Text style={styles.detail}>{order.customerName}</Text>
        )
      ) : (
        <>
          <OrderCustomer order={order} reportError={() => setFailed(true)} />
          <OrderAmounts order={order} mode={mode} />
        </>
      )}
      {!selectedChoice && targets.length > 0 && (
        <View style={styles.row}>
          {targets.map((target) => (
            <OrderButton
              key={target}
              testID={`transition-${target}`}
              label={text.transition[target]}
              disabled={saving || isOffline}
              onPress={() => choose(target)}
            />
          ))}
        </View>
      )}
      {selectedChoice && (
        <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.heading}>
            {selectedChoice === "ACCEPTED" ? text.prepTime : text.chooseReason}
          </Text>
          {selectedChoice !== "ACCEPTED" && (
            <TextInput
              accessibilityLabel={text.note}
              placeholder={text.note}
              style={styles.input}
              value={note}
              onChangeText={setNote}
              editable={!saving}
            />
          )}
          <View style={styles.row}>
            {selectedChoice === "ACCEPTED"
              ? prepTimes.map((prepMinutes) => (
                  <OrderButton
                    key={prepMinutes}
                    testID={`prep-${prepMinutes}`}
                    label={`${prepMinutes} ${text.minutes}`}
                    disabled={saving || isOffline}
                    onPress={() => {
                      void submit({ to: selectedChoice, prepMinutes });
                    }}
                  />
                ))
              : reasons[selectedChoice]?.map((reasonCode) => (
                  <OrderButton
                    key={reasonCode}
                    label={text.reason[reasonCode]}
                    disabled={saving || isOffline}
                    onPress={() => {
                      void submit({
                        to: selectedChoice,
                        reasonCode,
                        note: note.trim() || undefined,
                      });
                    }}
                  />
                ))}
          </View>
          <OrderButton
            label={text.back}
            disabled={saving}
            onPress={() => setChoice(null)}
          />
        </View>
      )}
      {saving && (
        <Text accessibilityLiveRegion="polite" style={styles.muted}>
          {text.saving}
        </Text>
      )}
      {failed && (
        <Text accessibilityRole="alert" style={styles.error}>
          {text.requestError}
        </Text>
      )}
    </ScrollView>
  );
}
