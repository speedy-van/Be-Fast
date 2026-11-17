import {
  CANCELLATION_REASON_CODES,
  DELIVERY_FAILURE_REASON_CODES,
  REJECTION_REASON_CODES,
  TERMINAL_STATES,
  canTargetStatus,
  canTransition,
  type AdminRole,
  type OrderStatus,
  type RestaurantRole,
} from "@be-fast/domain";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import type { OrderReasonCode } from "../generated/prisma/enums.ts";

type WriteCancellationAudit = (
  tx: Prisma.TransactionClient,
  before: { status: OrderStatus },
  after: { status: OrderStatus; reasonCode: OrderReasonCode | null },
) => Promise<void>;

export type TransitionActor =
  | { type: "CUSTOMER"; id: string }
  | {
      type: "RESTAURANT";
      id: string;
      restaurantId: string;
      role: RestaurantRole;
    }
  | {
      type: "ADMIN";
      id: string;
      role: AdminRole;
      audit: WriteCancellationAudit;
    }
  | { type: "SYSTEM" };

interface TransitionInput {
  id: string;
  to: OrderStatus;
  actor: TransitionActor;
  now: Date;
  expiresAtOrBefore?: Date;
  prepMinutes?: number;
  reasonCode?: OrderReasonCode;
  note?: string;
}

export interface TransitionResult {
  id: string;
  customerId: string;
  status: OrderStatus;
  changed: boolean;
}

const minutesMs = 60_000;
const reasonCodesByTarget: Partial<
  Record<OrderStatus, readonly OrderReasonCode[]>
> = {
  REJECTED: REJECTION_REASON_CODES,
  CANCELLED: CANCELLATION_REASON_CODES,
  DELIVERY_FAILED: DELIVERY_FAILURE_REASON_CODES,
};

function orderScope(actor: TransitionActor): Prisma.OrderWhereInput {
  if (actor.type === "CUSTOMER") return { customerId: actor.id };
  if (actor.type === "RESTAURANT")
    return { branch: { restaurantId: actor.restaurantId } };
  return {};
}

function validateReason(
  from: OrderStatus,
  to: OrderStatus,
  code?: OrderReasonCode,
) {
  const acceptedReasons = reasonCodesByTarget[to];
  if (!acceptedReasons) return undefined;

  const required = to !== "CANCELLED" || from !== "PENDING";
  if (
    (code === undefined && required) ||
    (code !== undefined && !acceptedReasons.includes(code))
  ) {
    throw new ApiError(400, "VALIDATION_ERROR");
  }
  return code;
}

function acceptanceTimes(
  now: Date,
  etaMinutes: number | null,
  prepMinutes?: number,
): Prisma.OrderUpdateManyMutationInput {
  if (
    prepMinutes === undefined ||
    !Number.isInteger(prepMinutes) ||
    prepMinutes < 5 ||
    prepMinutes > 180
  ) {
    throw new ApiError(400, "VALIDATION_ERROR");
  }
  const estimatedReadyAt = new Date(now.getTime() + prepMinutes * minutesMs);
  return {
    prepMinutes,
    acceptedAt: now,
    estimatedReadyAt,
    estimatedDeliveryAt:
      etaMinutes === null
        ? null
        : new Date(estimatedReadyAt.getTime() + etaMinutes * minutesMs),
  };
}

export async function transitionOrder(
  db: PrismaClient,
  input: TransitionInput,
): Promise<TransitionResult> {
  const { id, actor, to, now } = input;
  const scope = orderScope(actor);

  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id, ...scope },
      select: {
        id: true,
        customerId: true,
        branchId: true,
        status: true,
        type: true,
        etaMinutes: true,
        commissionMinor: true,
      },
    });
    if (!order) throw new ApiError(404, "NOT_FOUND");
    if (!canTargetStatus(to, actor, order.type))
      throw new ApiError(403, "FORBIDDEN");
    if (order.status === to)
      return { id, customerId: order.customerId, status: to, changed: false };
    if (!canTransition(order.status, to, actor, order.type))
      throw new ApiError(409, "INVALID_TRANSITION");

    const reasonCode = validateReason(order.status, to, input.reasonCode);
    const terminal = TERMINAL_STATES.has(to);
    const expirationFilter =
      to === "EXPIRED" ? input.expiresAtOrBefore : undefined;
    if (to === "EXPIRED" && !expirationFilter)
      throw new ApiError(409, "INVALID_TRANSITION");
    const update = await tx.order.updateMany({
      where: {
        id,
        ...scope,
        status: order.status,
        createdAt: expirationFilter && { lte: expirationFilter },
      },
      data: {
        status: to,
        updatedAt: now,
        needsAttention: order.status === "PENDING" ? false : undefined,
        finishedAt: terminal ? now : undefined,
        commissionMinor: terminal && to !== "DELIVERED" ? 0n : undefined,
        ...(to === "ACCEPTED"
          ? acceptanceTimes(
              now,
              order.type === "DELIVERY" ? order.etaMinutes : null,
              input.prepMinutes,
            )
          : {}),
      },
    });
    if (update.count !== 1) throw new ApiError(409, "INVALID_TRANSITION");

    await tx.orderStatusEvent.create({
      data: {
        orderId: id,
        from: order.status,
        to,
        actorType: actor.type,
        actorId: actor.type === "SYSTEM" ? null : actor.id,
        reasonCode,
        note: input.note,
        createdAt: now,
      },
      select: { id: true },
    });

    if (to === "DELIVERED") {
      const branch = await tx.branch.findFirstOrThrow({
        where: {
          id: order.branchId,
          restaurantId:
            actor.type === "RESTAURANT" ? actor.restaurantId : undefined,
        },
        select: { restaurantId: true },
      });
      await tx.ledgerEntry.create({
        data: {
          restaurantId: branch.restaurantId,
          orderId: id,
          type: "COMMISSION_ACCRUED",
          amountMinor: order.commissionMinor,
          createdAt: now,
        },
        select: { id: true },
      });
    }
    if (actor.type === "ADMIN") {
      await actor.audit(
        tx,
        { status: order.status },
        { status: to, reasonCode: reasonCode ?? null },
      );
    }

    return { id, customerId: order.customerId, status: to, changed: true };
  });
}
