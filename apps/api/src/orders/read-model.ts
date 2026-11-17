import type { OrderReadResponse } from "@be-fast/contracts";
import { maskPhone, ORDER_STATUSES, TERMINAL_STATES } from "@be-fast/domain";
import type { Principal } from "../auth/tokens.js";
import { ApiError } from "../errors.js";
import type { Prisma } from "../generated/prisma/client.ts";
import type { AdminRole, RestaurantRole } from "../generated/prisma/enums.ts";
import { minorNumber } from "../menu/shared.js";

const restaurantPrivacyWindowMs = 24 * 60 * 60 * 1000;

export const orderReadInclude = {
  branch: {
    select: {
      restaurantId: true,
      restaurant: { select: { name: true, contactPhone: true } },
    },
  },
  items: {
    orderBy: { id: "asc" },
    include: { options: { orderBy: { id: "asc" } } },
  },
  statusEvents: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
} satisfies Prisma.OrderInclude;

type StoredOrder = Prisma.OrderGetPayload<{ include: typeof orderReadInclude }>;
type OrderViewer =
  | { aud: "customer" }
  | { aud: "restaurant"; role: RestaurantRole }
  | { aud: "admin"; role: AdminRole };

function asAddress(value: Prisma.JsonValue) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

function lifecycleOrder(events: StoredOrder["statusEvents"]) {
  return [...events].sort(
    (first, second) =>
      first.createdAt.getTime() - second.createdAt.getTime() ||
      ORDER_STATUSES.indexOf(first.to) - ORDER_STATUSES.indexOf(second.to) ||
      first.id.localeCompare(second.id),
  );
}

export function serializeOrder(
  order: StoredOrder,
  viewer: OrderViewer,
  now: Date,
): OrderReadResponse {
  const restaurant = viewer.aud === "restaurant";
  const admin = viewer.aud === "admin";
  const kitchen = restaurant && viewer.role === "KITCHEN";
  const afterPrivacyWindow =
    restaurant &&
    TERMINAL_STATES.has(order.status) &&
    (order.finishedAt === null ||
      now.getTime() - order.finishedAt.getTime() >= restaurantPrivacyWindowMs);
  const hasCommissionAccess =
    (restaurant && viewer.role === "OWNER") ||
    (admin && viewer.role === "SUPER_ADMIN");

  return {
    id: order.id,
    branchId: order.branchId,
    restaurantId: order.branch.restaurantId,
    restaurantName: order.branch.restaurant.name,
    ...(restaurant
      ? {}
      : { restaurantPhone: order.branch.restaurant.contactPhone }),
    orderNumber: order.orderNumber,
    type: order.type,
    status: order.status,
    ...(admin
      ? { customerId: order.customerId, needsAttention: order.needsAttention }
      : {}),
    customerName: afterPrivacyWindow ? null : order.customerName,
    ...(kitchen
      ? {}
      : {
          customerPhone:
            afterPrivacyWindow && order.customerPhone
              ? maskPhone(order.customerPhone)
              : order.customerPhone,
          addressSnapshot: afterPrivacyWindow
            ? null
            : asAddress(order.addressSnapshot),
          foodSubtotalMinor: minorNumber(order.foodSubtotalMinor),
          discountMinor: minorNumber(order.discountMinor),
          deliveryFeeMinor: minorNumber(order.deliveryFeeMinor),
          totalMinor: minorNumber(order.totalMinor),
        }),
    ...(hasCommissionAccess
      ? {
          commissionMinor:
            order.status === "DELIVERED"
              ? minorNumber(order.commissionMinor)
              : 0,
          commissionRateBps: order.commissionRateBps,
        }
      : {}),
    note: order.note,
    createdAt: order.createdAt.toISOString(),
    acceptedAt: order.acceptedAt?.toISOString() ?? null,
    finishedAt: order.finishedAt?.toISOString() ?? null,
    estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
    estimatedDeliveryAt: order.estimatedDeliveryAt?.toISOString() ?? null,
    prepMinutes: order.prepMinutes,
    etaMinutes: order.etaMinutes,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.name,
      sizeName: item.sizeName,
      quantity: item.quantity,
      note: item.note,
      ...(kitchen
        ? {}
        : {
            unitPriceMinor: minorNumber(item.unitPriceMinor),
            totalMinor: minorNumber(item.totalMinor),
          }),
      options: item.options.map((option) => ({
        id: option.id,
        name: option.name,
        ...(kitchen ? {} : { priceMinor: minorNumber(option.priceMinor) }),
      })),
    })),
    events: lifecycleOrder(order.statusEvents).map((event) => ({
      id: event.id,
      from: event.from,
      to: event.to,
      actorType: event.actorType,
      ...(admin ? { actorId: event.actorId } : {}),
      reasonCode: event.reasonCode,
      note: event.note,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export function orderReadScope(principal: Principal): Prisma.OrderWhereInput {
  switch (principal.aud) {
    case "customer":
      return { customerId: principal.sub };
    case "restaurant":
      return { branch: { restaurantId: principal.restaurantId } };
    case "admin":
      return {};
  }
}

export async function readOrderForTransition(
  db: Prisma.TransactionClient,
  id: string,
  principal: Principal,
  now: Date,
): Promise<OrderReadResponse> {
  const order = await db.order.findFirst({
    where: { id, ...orderReadScope(principal) },
    include: orderReadInclude,
  });
  if (!order) throw new ApiError(404, "NOT_FOUND");
  return serializeOrder(order, principal, now);
}
