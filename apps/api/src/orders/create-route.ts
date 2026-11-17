import { randomInt, randomUUID } from "node:crypto";
import {
  orderCreateSchema,
  orderIdempotencyKeySchema,
  type OrderCreate,
} from "@be-fast/contracts";
import {
  calcItemTotal,
  calcOrderTotals,
  getOrderAvailability,
  TERMINAL_STATES,
  validateMenuOptions,
  type Weekday,
} from "@be-fast/domain";
import type { FastifyInstance } from "fastify";
import { requireCustomer } from "../auth/access.js";
import { isItemAvailableAt } from "../browse/shared.js";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { menuItemScope, minorNumber } from "../menu/shared.js";
import { notifyPush, type PushProvider } from "./push.js";
import {
  customerOrderView,
  orderReadInclude,
  serializeOrder,
} from "./read-model.js";

type Transaction = Prisma.TransactionClient;

const minuteMs = 60_000;
const creationLimit = 5;
const activeOrderMaximum = 2;
const terminalStates = [...TERMINAL_STATES];

const livePrice = { id: true, name: true, priceMinor: true } as const;
const menuFields = {
  id: true,
  name: true,
  isAvailable: true,
  availableFrom: true,
  availableTo: true,
  sizes: { where: { deletedAt: null }, select: livePrice },
} satisfies Prisma.MenuItemSelect;
const groupFields = {
  menuItemId: true,
  minSelect: true,
  maxSelect: true,
  options: {
    where: { deletedAt: null },
    select: { ...livePrice, isAvailable: true },
  },
} satisfies Prisma.OptionGroupSelect;
const orderBaseInclude = {
  branch: orderReadInclude.branch,
} satisfies Prisma.OrderInclude;

type MenuRow = Prisma.MenuItemGetPayload<{ select: typeof menuFields }> & {
  optionGroups: Omit<
    Prisma.OptionGroupGetPayload<{ select: typeof groupFields }>,
    "menuItemId"
  >[];
};
type OrderBase = Prisma.OrderGetPayload<{ include: typeof orderBaseInclude }>;

function createRateLimiter() {
  const windows = new Map<string, { count: number; expiresAt: number }>();
  let sweepAt = 0;
  return (customerId: string, instant: Date) => {
    const now = instant.getTime();
    if (now >= sweepAt) {
      for (const [id, entry] of windows) {
        if (entry.expiresAt <= now) windows.delete(id);
      }
      sweepAt = now + minuteMs;
    }
    const entry = windows.get(customerId);
    if (!entry || entry.expiresAt <= now) {
      windows.set(customerId, { count: 1, expiresAt: now + minuteMs });
      return 0;
    }
    if (entry.count >= creationLimit)
      return Math.ceil((entry.expiresAt - now) / 1_000);
    entry.count++;
    return 0;
  };
}

async function lockCustomer(tx: Transaction, id: string) {
  const [customer] = await tx.$queryRaw<
    { name: string | null; phone: string | null; blockedAt: Date | null }[]
  >`
    SELECT "name", "phone", "blockedAt" FROM "Customer"
    WHERE "id" = ${id}::uuid AND "deletedAt" IS NULL FOR UPDATE
  `;
  if (!customer) throw new ApiError(404, "NOT_FOUND");
  return customer;
}

async function readBranch(tx: Transaction, id: string) {
  // All menu mutations lock their Restaurant. Branch settings lock the Branch.
  const [restaurant] = await tx.$queryRaw<
    { id: string; status: "APPROVED"; commissionRateBps: number }[]
  >`
    SELECT r."id", r."status", r."commissionRateBps"
    FROM "Restaurant" r JOIN "Branch" b ON b."restaurantId" = r."id"
    WHERE b."id" = ${id}::uuid AND r."status" = 'APPROVED' FOR SHARE OF r
  `;
  if (!restaurant) throw new ApiError(409, "RESTAURANT_CLOSED");
  const [branch] = await tx.$queryRaw<
    {
      acceptingOrders: boolean;
      pickupEnabled: boolean;
      lastSeenAt: Date | null;
      minOrderMinor: bigint;
    }[]
  >`
    SELECT "acceptingOrders", "pickupEnabled", "lastSeenAt", "minOrderMinor"
    FROM "Branch" WHERE "id" = ${id}::uuid FOR SHARE
  `;
  if (!branch) throw new ApiError(409, "RESTAURANT_CLOSED");

  const openingPeriods = await tx.openingPeriod.findMany({
    where: { branchId: id },
    select: { dayOfWeek: true, opensAt: true, closesAt: true },
  });
  const periods = openingPeriods.filter(
    (period): period is typeof period & { dayOfWeek: Weekday } =>
      period.dayOfWeek >= 0 && period.dayOfWeek <= 6,
  );
  return { restaurant, branch, periods };
}

async function readAddress(tx: Transaction, customerId: string, id: string) {
  const result = await tx.customerAddress.findUnique({
    where: { id, customerId },
    select: {
      neighborhoodId: true,
      street: true,
      landmark: true,
      building: true,
      floor: true,
      notes: true,
      label: true,
      latitude: true,
      longitude: true,
      neighborhood: {
        select: {
          name: true,
          isActive: true,
          city: {
            select: {
              name: true,
              isActive: true,
              governorate: { select: { name: true, isActive: true } },
            },
          },
        },
      },
    },
  });
  if (!result) throw new ApiError(404, "NOT_FOUND");
  const { neighborhood, ...address } = result;
  const { city } = neighborhood;
  return {
    active: neighborhood.isActive && city.isActive && city.governorate.isActive,
    snapshot: {
      ...address,
      neighborhoodName: neighborhood.name,
      cityName: city.name,
      governorateName: city.governorate.name,
    },
  };
}

async function readMenu(
  tx: Transaction,
  restaurantId: string,
  menuItemIds: string[],
) {
  // Prisma loads sibling relations concurrently, but a transaction has one pg client.
  const items = await tx.menuItem.findMany({
    where: { ...menuItemScope(restaurantId), id: { in: menuItemIds } },
    select: menuFields,
  });
  const menu = new Map<string, MenuRow>(
    items.map((item) => [item.id, { ...item, optionGroups: [] }]),
  );
  const groups = await tx.optionGroup.findMany({
    where: { menuItemId: { in: [...menu.keys()] }, deletedAt: null },
    select: groupFields,
  });
  for (const { menuItemId, ...group } of groups)
    menu.get(menuItemId)?.optionGroups.push(group);
  return menu;
}

async function readOrderRelations(tx: Transaction, order: OrderBase) {
  const where = { orderId: order.id };
  const items = await tx.orderItem.findMany({
    where,
    ...orderReadInclude.items,
  });
  const statusEvents = await tx.orderStatusEvent.findMany({
    where,
    ...orderReadInclude.statusEvents,
  });
  return { ...order, items, statusEvents };
}

function itemSnapshot(
  input: OrderCreate["items"][number],
  item: MenuRow | undefined,
  instant: Date,
) {
  const size = item?.sizes.find(({ id }) => id === input.sizeId);
  if (!item || !size || !isItemAvailableAt(item, instant))
    throw new ApiError(409, "ITEM_UNAVAILABLE");
  if (!validateMenuOptions(item.optionGroups, input.optionIds))
    throw new ApiError(409, "INVALID_OPTIONS");

  const selected = new Set(input.optionIds);
  const options = item.optionGroups.flatMap(({ options }) =>
    options.filter(({ id }) => selected.has(id)),
  );
  const sizePriceMinor = minorNumber(size.priceMinor);
  const optionPricesMinor = options.map(({ priceMinor }) =>
    minorNumber(priceMinor),
  );
  return {
    id: randomUUID(),
    menuItemId: item.id,
    sizeId: size.id,
    name: item.name,
    sizeName: size.name,
    quantity: input.quantity,
    note: input.note,
    unitPriceMinor: calcItemTotal(sizePriceMinor, optionPricesMinor, 1),
    totalMinor: calcItemTotal(
      sizePriceMinor,
      optionPricesMinor,
      input.quantity,
    ),
    options: options.map(({ id, name, priceMinor }) => ({
      optionId: id,
      name,
      priceMinor,
    })),
  };
}

async function checkActiveOrders(tx: Transaction, customerId: string) {
  const setting = await tx.platformSetting.findUnique({
    where: { key: "order.maxActivePerCustomer" },
    select: { value: true },
  });
  const value = setting?.value;
  const limit =
    typeof value === "number" && Number.isInteger(value) && value > 0
      ? Math.min(value, activeOrderMaximum)
      : activeOrderMaximum;
  const count = await tx.order.count({
    where: { customerId, status: { notIn: terminalStates } },
    take: limit,
  });
  if (count >= limit) throw new ApiError(409, "TOO_MANY_ACTIVE_ORDERS");
}

async function insertOrder(
  tx: Transaction,
  data: Omit<Prisma.OrderCreateManyInput, "orderNumber">,
) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const [created] = await tx.order.createManyAndReturn({
      data: { ...data, orderNumber: `BF-${randomInt(100_000, 1_000_000)}` },
      skipDuplicates: true,
      select: { id: true },
    });
    if (created) return created.id;
  }
  throw new ApiError(500, "INTERNAL_ERROR");
}

async function createOrder(
  tx: Transaction,
  customerId: string,
  customer: Awaited<ReturnType<typeof lockCustomer>>,
  idempotencyKey: string,
  input: OrderCreate,
  instant: Date,
) {
  if (customer.blockedAt !== null)
    throw new ApiError(403, "ACCOUNT_UNAVAILABLE");
  if (customer.name === null)
    throw new ApiError(400, "VALIDATION_ERROR", { field: "name" });

  const { branchId, type } = input;
  const { restaurant, branch, periods } = await readBranch(tx, branchId);
  const address =
    input.type === "DELIVERY"
      ? await readAddress(tx, customerId, input.addressId)
      : null;
  const zone = address?.active
    ? await tx.deliveryZone.findUnique({
        where: {
          branchId_neighborhoodId: {
            branchId,
            neighborhoodId: address.snapshot.neighborhoodId,
          },
        },
        select: { feeMinor: true, etaMinutes: true },
      })
    : null;
  const availability = getOrderAvailability({
    restaurantStatus: restaurant.status,
    orderType: type,
    ...branch,
    periods,
    instantUtc: instant,
    hasDeliveryZone: zone !== null,
    hasAvailableItem: true,
  });
  if (!availability.isOrderable) {
    throw new ApiError(
      409,
      availability.reason === "OUT_OF_ZONE"
        ? "OUT_OF_ZONE"
        : "RESTAURANT_CLOSED",
    );
  }

  const menuById = await readMenu(tx, restaurant.id, [
    ...new Set(input.items.map(({ menuItemId }) => menuItemId)),
  ]);
  // Each submitted line must be available and carts are nonempty.
  const items = input.items.map((item) =>
    itemSnapshot(item, menuById.get(item.menuItemId), instant),
  );
  const totals = calcOrderTotals(
    items.map(({ totalMinor }) => totalMinor),
    zone ? minorNumber(zone.feeMinor) : 0,
    restaurant.commissionRateBps,
  );
  const minOrderMinor = minorNumber(branch.minOrderMinor);
  if (totals.foodSubtotalMinor < minOrderMinor)
    throw new ApiError(409, "BELOW_MINIMUM", {
      minOrderMinor,
      foodSubtotalMinor: totals.foodSubtotalMinor,
    });
  if (totals.totalMinor !== input.expectedTotalMinor) {
    const { foodSubtotalMinor, discountMinor, deliveryFeeMinor, totalMinor } =
      totals;
    throw new ApiError(409, "PRICE_CHANGED", {
      foodSubtotalMinor,
      discountMinor,
      deliveryFeeMinor,
      totalMinor,
      items: items.map(
        ({
          menuItemId,
          sizeId,
          quantity,
          unitPriceMinor,
          totalMinor,
          options,
        }) => ({
          menuItemId,
          sizeId,
          quantity,
          unitPriceMinor,
          totalMinor,
          optionIds: options.map(({ optionId }) => optionId),
        }),
      ),
    });
  }
  await checkActiveOrders(tx, customerId);

  const orderId = await insertOrder(tx, {
    customerId,
    branchId,
    idempotencyKey,
    type,
    customerName: customer.name,
    customerPhone: customer.phone,
    addressSnapshot: address?.snapshot,
    note: input.note,
    etaMinutes: zone?.etaMinutes,
    foodSubtotalMinor: BigInt(totals.foodSubtotalMinor),
    discountMinor: BigInt(totals.discountMinor),
    deliveryFeeMinor: BigInt(totals.deliveryFeeMinor),
    totalMinor: BigInt(totals.totalMinor),
    commissionRateBps: restaurant.commissionRateBps,
    commissionMinor: BigInt(totals.commissionMinor),
    createdAt: instant,
  });
  await tx.orderItem.createMany({
    data: items.map(
      ({
        id,
        menuItemId,
        sizeId,
        name,
        sizeName,
        quantity,
        note,
        unitPriceMinor,
        totalMinor,
      }) => ({
        id,
        orderId,
        menuItemId,
        sizeId,
        name,
        sizeName,
        quantity,
        note,
        unitPriceMinor: BigInt(unitPriceMinor),
        totalMinor: BigInt(totalMinor),
      }),
    ),
  });
  const options = items.flatMap(({ id, options }) =>
    options.map((option) => ({ orderItemId: id, ...option })),
  );
  if (options.length > 0)
    await tx.orderItemOption.createMany({ data: options });
  await tx.orderStatusEvent.create({
    data: {
      orderId,
      to: "PENDING",
      actorType: "CUSTOMER",
      actorId: customerId,
      createdAt: instant,
    },
  });
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: orderBaseInclude,
  });
  return {
    order: await readOrderRelations(tx, order),
    restaurantId: restaurant.id,
  };
}

export function registerOrderCreateRoute(
  api: FastifyInstance,
  { db, now, push }: { db: PrismaClient; now: () => Date; push: PushProvider },
): void {
  const consumeAttempt = createRateLimiter();
  api.post("/customer/orders", async (request, reply) => {
    const { sub: customerId } = requireCustomer(request);
    const idempotencyKey = orderIdempotencyKeySchema.parse(
      request.headers["idempotency-key"],
    );
    const result = await db.$transaction(async (tx) => {
      const customer = await lockCustomer(tx, customerId);
      const previous = await tx.order.findUnique({
        where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
        include: orderBaseInclude,
      });
      if (previous)
        return {
          order: await readOrderRelations(tx, previous),
          restaurantId: null,
        };

      const instant = now();
      const retryAfterSec = consumeAttempt(customerId, instant);
      if (retryAfterSec > 0) {
        reply.header("Retry-After", retryAfterSec);
        throw new ApiError(429, "RATE_LIMITED", { retryAfterSec });
      }
      return createOrder(
        tx,
        customerId,
        customer,
        idempotencyKey,
        orderCreateSchema.parse(request.body),
        instant,
      );
    });

    const { order, restaurantId } = result;
    if (restaurantId !== null)
      await notifyPush(api.log, () => push.newOrder(restaurantId, order.id));
    const instant = now();
    const snapshot = serializeOrder(order, { aud: "customer" }, instant);
    return reply
      .code(restaurantId === null ? 200 : 201)
      .send(await customerOrderView(db, snapshot, instant));
  });
}
