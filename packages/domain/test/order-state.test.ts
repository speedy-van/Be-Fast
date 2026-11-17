import { describe, expect, it } from "vitest";
import {
  ADMIN_ROLES,
  allowedTransitions,
  CANCELLATION_REASON_CODES,
  canTargetStatus,
  canTransition,
  DELIVERY_FAILURE_REASON_CODES,
  ORDER_STATUSES,
  ORDER_TYPES,
  REJECTION_REASON_CODES,
  RESTAURANT_ROLES,
  TERMINAL_STATES,
  type OrderActor,
  type OrderStatus,
  type OrderType,
} from "../src/order-state.js";

const actors = {
  customer: { type: "CUSTOMER" },
  system: { type: "SYSTEM" },
  owner: { type: "RESTAURANT", role: "OWNER" },
  manager: { type: "RESTAURANT", role: "MANAGER" },
  cashier: { type: "RESTAURANT", role: "CASHIER" },
  kitchen: { type: "RESTAURANT", role: "KITCHEN" },
  superAdmin: { type: "ADMIN", role: "SUPER_ADMIN" },
  operations: { type: "ADMIN", role: "OPERATIONS" },
  finance: { type: "ADMIN", role: "FINANCE" },
  support: { type: "ADMIN", role: "SUPPORT" },
} as const satisfies Record<string, OrderActor>;

type ActorName = keyof typeof actors;
type SpecRow = readonly [
  OrderStatus,
  OrderStatus,
  readonly ActorName[],
  OrderType?,
];

// The expected permissions are transcribed independently from SPEC §8.2 and §12.
const specTable: readonly SpecRow[] = [
  ["PENDING", "ACCEPTED", ["owner", "manager", "cashier"]],
  ["PENDING", "REJECTED", ["owner", "manager", "cashier"]],
  ["PENDING", "CANCELLED", ["customer", "superAdmin", "operations"]],
  ["PENDING", "EXPIRED", ["system"]],
  ["ACCEPTED", "PREPARING", ["owner", "manager", "cashier", "kitchen"]],
  ["PREPARING", "READY", ["owner", "manager", "cashier", "kitchen"]],
  ["READY", "OUT_FOR_DELIVERY", ["owner", "manager", "cashier"], "DELIVERY"],
  ["READY", "DELIVERED", ["owner", "manager", "cashier"], "PICKUP"],
  ["OUT_FOR_DELIVERY", "DELIVERED", ["owner", "manager", "cashier"]],
  ["OUT_FOR_DELIVERY", "DELIVERY_FAILED", ["owner", "manager", "cashier"]],
  ["ACCEPTED", "CANCELLED", ["owner", "manager", "superAdmin", "operations"]],
  ["PREPARING", "CANCELLED", ["owner", "manager", "superAdmin", "operations"]],
  ["READY", "CANCELLED", ["owner", "manager", "superAdmin", "operations"]],
  ["OUT_FOR_DELIVERY", "CANCELLED", ["superAdmin", "operations"]],
];

const specTerminalStates = [
  "DELIVERED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
  "DELIVERY_FAILED",
] as const;

const actorAndTypeCases = ORDER_TYPES.flatMap((orderType) =>
  (Object.keys(actors) as ActorName[]).map((actorName) => ({
    actorName,
    orderType,
  })),
);

describe("order transitions", () => {
  it("exposes the statuses, roles, order types, and terminal states in the specification", () => {
    expect(ORDER_STATUSES).toEqual([
      "PENDING",
      "ACCEPTED",
      "PREPARING",
      "READY",
      "OUT_FOR_DELIVERY",
      ...specTerminalStates,
    ]);
    expect(RESTAURANT_ROLES).toEqual([
      "OWNER",
      "MANAGER",
      "CASHIER",
      "KITCHEN",
    ]);
    expect(ADMIN_ROLES).toEqual([
      "SUPER_ADMIN",
      "OPERATIONS",
      "FINANCE",
      "SUPPORT",
    ]);
    expect(ORDER_TYPES).toEqual(["DELIVERY", "PICKUP"]);
    expect(TERMINAL_STATES).toEqual(new Set(specTerminalStates));
  });

  it.each(actorAndTypeCases)(
    "matches every state pair for $actorName on $orderType orders",
    ({ actorName, orderType }) => {
      const actor = actors[actorName];
      const eligibleRows = specTable.filter(
        ([, , permittedActors, requiredType]) =>
          permittedActors.includes(actorName) &&
          (requiredType === undefined || requiredType === orderType),
      );

      for (const from of ORDER_STATUSES) {
        const allowed = eligibleRows
          .filter(([origin]) => origin === from)
          .map(([, to]) => to);
        for (const to of ORDER_STATUSES) {
          expect(
            canTransition(from, to, actor, orderType),
            `${from} -> ${to}`,
          ).toBe(allowed.includes(to));
        }
        expect(
          allowedTransitions(from, actor, orderType).sort(),
          `actions from ${from}`,
        ).toEqual(allowed.sort());
      }

      for (const to of ORDER_STATUSES) {
        expect(
          canTargetStatus(to, actor, orderType),
          `permission to target ${to}`,
        ).toBe(eligibleRows.some(([, destination]) => destination === to));
      }
    },
  );

  it.each(specTerminalStates)(
    "does not allow any actor to leave %s",
    (from) => {
      for (const { actorName, orderType } of actorAndTypeCases) {
        expect(allowedTransitions(from, actors[actorName], orderType)).toEqual(
          [],
        );
      }
    },
  );

  it("checks target permission separately from a state change for retries", () => {
    expect(canTargetStatus("DELIVERED", actors.cashier, "DELIVERY")).toBe(true);
    expect(canTargetStatus("DELIVERED", actors.kitchen, "DELIVERY")).toBe(
      false,
    );
    expect(canTargetStatus("OUT_FOR_DELIVERY", actors.owner, "PICKUP")).toBe(
      false,
    );
    expect(
      canTransition("DELIVERED", "DELIVERED", actors.cashier, "DELIVERY"),
    ).toBe(false);
  });

  it("exposes the distinct reason lists for rejection, cancellation, and failed delivery", () => {
    expect(REJECTION_REASON_CODES).toEqual([
      "TOO_BUSY",
      "ITEM_UNAVAILABLE",
      "CLOSING_SOON",
      "OUT_OF_ZONE",
      "OTHER",
    ]);
    expect(CANCELLATION_REASON_CODES).toEqual([
      "CUSTOMER_REQUEST",
      "ITEM_UNAVAILABLE",
      "NO_DRIVER",
      "DUPLICATE",
      "SUSPECTED_FAKE",
      "OTHER",
    ]);
    expect(DELIVERY_FAILURE_REASON_CODES).toEqual([
      "CUSTOMER_UNREACHABLE",
      "WRONG_ADDRESS",
      "CUSTOMER_REFUSED",
      "OTHER",
    ]);
  });
});
