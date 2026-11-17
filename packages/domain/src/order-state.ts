export const ORDER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
  "DELIVERY_FAILED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_STATES: ReadonlySet<OrderStatus> = new Set([
  "DELIVERED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
  "DELIVERY_FAILED",
]);

export const ORDER_TYPES = ["DELIVERY", "PICKUP"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const RESTAURANT_ROLES = [
  "OWNER",
  "MANAGER",
  "CASHIER",
  "KITCHEN",
] as const;
export type RestaurantRole = (typeof RESTAURANT_ROLES)[number];

export const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "OPERATIONS",
  "FINANCE",
  "SUPPORT",
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type OrderActor =
  | { type: "CUSTOMER" }
  | { type: "SYSTEM" }
  | { type: "RESTAURANT"; role: RestaurantRole }
  | { type: "ADMIN"; role: AdminRole };

export const REJECTION_REASON_CODES = [
  "TOO_BUSY",
  "ITEM_UNAVAILABLE",
  "CLOSING_SOON",
  "OUT_OF_ZONE",
  "OTHER",
] as const;
export type RejectionReasonCode = (typeof REJECTION_REASON_CODES)[number];

export const CANCELLATION_REASON_CODES = [
  "CUSTOMER_REQUEST",
  "ITEM_UNAVAILABLE",
  "NO_DRIVER",
  "DUPLICATE",
  "SUSPECTED_FAKE",
  "OTHER",
] as const;
export type CancellationReasonCode = (typeof CANCELLATION_REASON_CODES)[number];

export const DELIVERY_FAILURE_REASON_CODES = [
  "CUSTOMER_UNREACHABLE",
  "WRONG_ADDRESS",
  "CUSTOMER_REFUSED",
  "OTHER",
] as const;
export type DeliveryFailureReasonCode =
  (typeof DELIVERY_FAILURE_REASON_CODES)[number];

interface TransitionRule {
  from: readonly OrderStatus[];
  to: OrderStatus;
  orderType?: OrderType;
  customer?: true;
  system?: true;
  restaurant?: readonly RestaurantRole[];
  admin?: readonly AdminRole[];
}

const restaurantOperators = ["OWNER", "MANAGER", "CASHIER"] as const;
const restaurantManagers = ["OWNER", "MANAGER"] as const;
// Support can read orders. Operations and super admins can cancel them.
const orderManagingAdmins = ["SUPER_ADMIN", "OPERATIONS"] as const;

const transitionRules: readonly TransitionRule[] = [
  { from: ["PENDING"], to: "ACCEPTED", restaurant: restaurantOperators },
  { from: ["PENDING"], to: "REJECTED", restaurant: restaurantOperators },
  {
    from: ["PENDING"],
    to: "CANCELLED",
    customer: true,
    admin: orderManagingAdmins,
  },
  { from: ["PENDING"], to: "EXPIRED", system: true },
  { from: ["ACCEPTED"], to: "PREPARING", restaurant: RESTAURANT_ROLES },
  { from: ["PREPARING"], to: "READY", restaurant: RESTAURANT_ROLES },
  {
    from: ["READY"],
    to: "OUT_FOR_DELIVERY",
    orderType: "DELIVERY",
    restaurant: restaurantOperators,
  },
  {
    from: ["READY"],
    to: "DELIVERED",
    orderType: "PICKUP",
    restaurant: restaurantOperators,
  },
  {
    from: ["OUT_FOR_DELIVERY"],
    to: "DELIVERED",
    restaurant: restaurantOperators,
  },
  {
    from: ["OUT_FOR_DELIVERY"],
    to: "DELIVERY_FAILED",
    restaurant: restaurantOperators,
  },
  {
    from: ["ACCEPTED", "PREPARING", "READY"],
    to: "CANCELLED",
    restaurant: restaurantManagers,
    admin: orderManagingAdmins,
  },
  { from: ["OUT_FOR_DELIVERY"], to: "CANCELLED", admin: orderManagingAdmins },
];

function appliesTo(
  rule: TransitionRule,
  actor: OrderActor,
  orderType: OrderType,
): boolean {
  if (rule.orderType !== undefined && rule.orderType !== orderType) {
    return false;
  }

  switch (actor.type) {
    case "CUSTOMER":
      return rule.customer === true;
    case "SYSTEM":
      return rule.system === true;
    case "RESTAURANT":
      return rule.restaurant?.includes(actor.role) ?? false;
    case "ADMIN":
      return rule.admin?.includes(actor.role) ?? false;
  }
}

export function canTargetStatus(
  to: OrderStatus,
  actor: OrderActor,
  orderType: OrderType,
): boolean {
  return transitionRules.some(
    (rule) => rule.to === to && appliesTo(rule, actor, orderType),
  );
}

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: OrderActor,
  orderType: OrderType,
): boolean {
  return transitionRules.some(
    (rule) =>
      rule.to === to &&
      rule.from.includes(from) &&
      appliesTo(rule, actor, orderType),
  );
}

export function allowedTransitions(
  from: OrderStatus,
  actor: OrderActor,
  orderType: OrderType,
): OrderStatus[] {
  return ORDER_STATUSES.filter((to) =>
    canTransition(from, to, actor, orderType),
  );
}
