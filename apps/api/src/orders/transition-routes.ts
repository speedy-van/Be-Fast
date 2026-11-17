import {
  orderCancellationSchema,
  orderTransitionParamsSchema,
  restaurantOrderTransitionSchema,
} from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import { writeAdminAudit } from "../audit.js";
import {
  requireAdmin,
  requireCustomer,
  requireRestaurant,
} from "../auth/access.js";
import type { Principal } from "../auth/tokens.js";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { notifyPush, type PushProvider } from "./push.js";
import { readOrderForTransition } from "./read-model.js";
import { transitionOrder } from "./transition.js";

interface TransitionRouteOptions {
  db: PrismaClient;
  now: () => Date;
  push: PushProvider;
}

export function registerOrderTransitionRoutes(
  api: FastifyInstance,
  { db, now, push }: TransitionRouteOptions,
): void {
  async function applyTransition(
    principal: Principal,
    input: Omit<Parameters<typeof transitionOrder>[1], "now">,
  ) {
    const instant = now();
    const result = await transitionOrder(db, { ...input, now: instant });
    if (result.changed) {
      await notifyPush(api.log, () =>
        push.orderStatusChanged(result.customerId, result.id, result.status),
      );
    }
    return readOrderForTransition(db, result.id, principal, instant);
  }

  api.post("/customer/orders/:id/cancel", async (request) => {
    const principal = requireCustomer(request);
    const { id } = orderTransitionParamsSchema.parse(request.params);
    const cancel = orderCancellationSchema.parse(request.body ?? {});
    return applyTransition(principal, {
      ...cancel,
      id,
      to: "CANCELLED",
      actor: { type: "CUSTOMER", id: principal.sub },
    });
  });

  api.post("/restaurant/orders/:id/transition", async (request) => {
    const principal = requireRestaurant(request);
    const { id } = orderTransitionParamsSchema.parse(request.params);
    const transition = restaurantOrderTransitionSchema.parse(request.body);
    return applyTransition(principal, {
      ...transition,
      id,
      actor: {
        type: "RESTAURANT",
        id: principal.sub,
        role: principal.role,
        restaurantId: principal.restaurantId,
      },
    });
  });

  api.post("/admin/orders/:id/cancel", async (request) => {
    const principal = requireAdmin(request);
    const { id } = orderTransitionParamsSchema.parse(request.params);
    const cancel = orderCancellationSchema.parse(request.body ?? {});
    return applyTransition(principal, {
      ...cancel,
      id,
      to: "CANCELLED",
      actor: {
        type: "ADMIN",
        id: principal.sub,
        role: principal.role,
        audit: (tx, before, after) =>
          writeAdminAudit(tx, request, {
            action: "ORDER_CANCEL",
            entityType: "Order",
            entityId: id,
            before,
            after,
          }),
      },
    });
  });
}
