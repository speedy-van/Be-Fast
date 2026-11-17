import {
  adminOrderListQuerySchema,
  readOrderParamsSchema,
  restaurantOrderListQuerySchema,
} from "@be-fast/contracts";
import {
  normalizeSyrianPhone,
  TERMINAL_STATES,
  type OrderStatus,
} from "@be-fast/domain";
import type { FastifyInstance } from "fastify";
import {
  requireAdmin,
  requireAdminRole,
  requireCustomer,
  requireRestaurant,
  requireRestaurantRole,
} from "../auth/access.js";
import type { Principal } from "../auth/tokens.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import {
  orderReadInclude,
  orderReadScope,
  readOrderForTransition,
  serializeOrder,
} from "./read-model.js";

const orderReaders = {
  preHandler: requireRestaurantRole("OWNER", "MANAGER", "CASHIER", "KITCHEN"),
};
const adminOrderReaders = {
  preHandler: requireAdminRole("SUPER_ADMIN", "OPERATIONS", "SUPPORT"),
};

function dateFilters({
  status,
  from,
  to,
}: {
  status?: OrderStatus;
  from?: string;
  to?: string;
}): Prisma.OrderWhereInput {
  return {
    status,
    createdAt:
      from === undefined && to === undefined
        ? undefined
        : {
            gte: from === undefined ? undefined : new Date(from),
            lte: to === undefined ? undefined : new Date(to),
          },
  };
}

async function listOrders(
  db: PrismaClient,
  principal: Principal,
  now: Date,
  filter: Prisma.OrderWhereInput = {},
) {
  const orders = await db.order.findMany({
    where: { ...filter, ...orderReadScope(principal) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: orderReadInclude,
  });
  return {
    orders: orders.map((order) => serializeOrder(order, principal, now)),
  };
}

export function registerOrderReadRoutes(
  api: FastifyInstance,
  { db, now }: { db: PrismaClient; now: () => Date },
) {
  api.get("/customer/orders", (request) =>
    listOrders(db, requireCustomer(request), now()),
  );

  api.get("/customer/orders/:id", (request) => {
    const { id } = readOrderParamsSchema.parse(request.params);
    return readOrderForTransition(db, id, requireCustomer(request), now());
  });

  api.get("/restaurant/orders/active", orderReaders, async (request) => {
    const viewer = requireRestaurant(request);
    const seenAt = now();
    await db.branch.updateMany({
      where: {
        restaurantId: viewer.restaurantId,
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: seenAt } }],
      },
      data: { lastSeenAt: seenAt },
    });
    return listOrders(db, viewer, seenAt, {
      status: { notIn: [...TERMINAL_STATES] },
    });
  });

  api.get("/restaurant/orders", orderReaders, (request) => {
    const filters = restaurantOrderListQuerySchema.parse(request.query);
    return listOrders(
      db,
      requireRestaurant(request),
      now(),
      dateFilters(filters),
    );
  });

  api.get("/restaurant/orders/:id", orderReaders, (request) => {
    const { id } = readOrderParamsSchema.parse(request.params);
    return readOrderForTransition(db, id, requireRestaurant(request), now());
  });

  api.get("/admin/orders/needs-attention", adminOrderReaders, (request) =>
    listOrders(db, requireAdmin(request), now(), {
      status: "PENDING",
      needsAttention: true,
    }),
  );

  api.get("/admin/orders", adminOrderReaders, (request) => {
    const { q, ...filters } = adminOrderListQuerySchema.parse(request.query);
    const phone = q === undefined ? null : normalizeSyrianPhone(q);
    return listOrders(db, requireAdmin(request), now(), {
      ...dateFilters(filters),
      OR:
        q === undefined
          ? undefined
          : [
              { orderNumber: { contains: q, mode: "insensitive" } },
              { customerName: { contains: q, mode: "insensitive" } },
              ...(phone === null ? [] : [{ customerPhone: phone }]),
            ],
    });
  });

  api.get("/admin/orders/:id", adminOrderReaders, (request) => {
    const { id } = readOrderParamsSchema.parse(request.params);
    return readOrderForTransition(db, id, requireAdmin(request), now());
  });
}
