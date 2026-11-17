import { randomUUID } from "node:crypto";
import { errorEnvelopeSchema } from "@be-fast/contracts";
import { expect, it } from "vitest";
import type { PushProvider } from "../src/orders/push.js";
import { openAuthTest } from "./auth-test-support.js";

async function fixture(test: ReturnType<typeof openAuthTest>) {
  const { api, db, tokens, clock } = test;
  const customer = await db.customer.create({
    data: { name: "عميل الطلب التجريبي" },
    select: { id: true },
  });
  const { accessToken } = await tokens.issue({
    aud: "customer",
    sub: customer.id,
  });
  const city = await db.city.create({
    data: {
      name: "مدينة الطلب التجريبي",
      governorate: { create: { name: "محافظة الطلب التجريبي" } },
      neighborhoods: {
        create: [{ name: "حي التوصيل" }, { name: "حي خارج النطاق" }],
      },
    },
    select: { neighborhoods: { select: { id: true, name: true } } },
  });
  const neighborhoodId = city.neighborhoods.find(
    ({ name }) => name === "حي التوصيل",
  )?.id;
  const outsideId = city.neighborhoods.find(
    ({ name }) => name === "حي خارج النطاق",
  )?.id;
  if (!neighborhoodId || !outsideId)
    throw new Error("Order fixture neighborhoods are missing.");
  const [address, outsideAddress] = await Promise.all(
    [neighborhoodId, outsideId].map((id) =>
      db.customerAddress.create({
        data: {
          customerId: customer.id,
          neighborhoodId: id,
          street: "شارع الطلب",
          landmark: "معلم الطلب",
        },
        select: { id: true },
      }),
    ),
  );
  if (!address || !outsideAddress)
    throw new Error("Order fixture addresses are missing.");

  const restaurant = await db.restaurant.create({
    data: {
      name: "مطعم الطلب التجريبي",
      status: "APPROVED",
      commissionRateBps: 1_000,
      branch: {
        create: {
          acceptingOrders: true,
          pickupEnabled: true,
          lastSeenAt: clock.now,
          minOrderMinor: 40_000n,
          openingPeriods: {
            create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
              dayOfWeek,
              opensAt: "09:00",
              closesAt: "23:59",
            })),
          },
          deliveryZones: {
            create: { neighborhoodId, feeMinor: 10_000n, etaMinutes: 30 },
          },
        },
      },
      menuSections: {
        create: {
          name: "قسم الطلب",
          items: {
            create: {
              name: "الوجبة الأصلية",
              sizes: { create: { name: "كبير", priceMinor: 38_000n } },
              optionGroups: {
                create: {
                  name: "تتبيلة",
                  minSelect: 1,
                  maxSelect: 1,
                  options: {
                    create: { name: "تتبيلة أصلية", priceMinor: 2_000n },
                  },
                },
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
      branch: { select: { id: true } },
      menuSections: {
        select: {
          items: {
            select: {
              id: true,
              sizes: { select: { id: true } },
              optionGroups: { select: { options: { select: { id: true } } } },
            },
          },
        },
      },
    },
  });
  const branchId = restaurant.branch?.id;
  const item = restaurant.menuSections[0]?.items[0];
  const sizeId = item?.sizes[0]?.id;
  const optionId = item?.optionGroups[0]?.options[0]?.id;
  if (!branchId || !item || !sizeId || !optionId)
    throw new Error("Order fixture menu is incomplete.");

  const line = {
    menuItemId: item.id,
    sizeId,
    optionIds: [optionId],
    quantity: 2,
    note: "ملاحظة الصنف",
  };
  const body = {
    branchId,
    type: "DELIVERY",
    addressId: address.id,
    items: [line],
    note: "ملاحظة الطلب",
    expectedTotalMinor: 90_000,
  };
  const headers = { authorization: `Bearer ${accessToken}` };
  return {
    customerId: customer.id,
    restaurantId: restaurant.id,
    branchId,
    itemId: item.id,
    sizeId,
    optionId,
    addressId: address.id,
    outsideAddressId: outsideAddress.id,
    line,
    body,
    post(
      payload: Record<string, unknown> = body,
      idempotencyKey = randomUUID(),
    ) {
      return api.inject({
        method: "POST",
        url: "/customer/orders",
        payload,
        headers: { ...headers, "idempotency-key": idempotencyKey },
      });
    },
    get(orderId: string) {
      return api.inject({
        method: "GET",
        url: `/customer/orders/${orderId}`,
        headers,
      });
    },
  };
}

it("uses server prices and atomic snapshots, ignores forged amounts and notifies once despite a failed push", async () => {
  const sends: { restaurantId: string; orderId: string }[] = [];
  const push: PushProvider = {
    async newOrder(restaurantId, orderId) {
      sends.push({ restaurantId, orderId });
      throw new Error("Test notification unavailable.");
    },
    async orderStatusChanged() {},
    async orderReminder() {},
  };
  const test = openAuthTest({ push });
  const { api, db } = test;
  try {
    const shop = await fixture(test);
    const idempotencyKey = randomUUID();
    const forged = {
      ...shop.body,
      customerId: randomUUID(),
      foodSubtotalMinor: 10,
      commissionRateBps: 0,
      deliveryFeeMinor: 0,
      items: [{ ...shop.line, unitPriceMinor: 1, totalMinor: 2 }],
    };
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => shop.post(forged, idempotencyKey)),
    );
    expect(outcomes.map(({ statusCode }) => statusCode).sort()).toEqual([
      200, 200, 200, 200, 200, 200, 200, 200, 200, 201,
    ]);
    const id = outcomes[0]?.json<{ id: string }>().id;
    if (!id) throw new Error("The created order id is missing.");
    expect(
      outcomes.map((response) => response.json<{ id: string }>().id),
    ).toEqual(Array<string>(10).fill(id));
    expect(
      await db.order.count({
        where: { customerId: shop.customerId, idempotencyKey },
      }),
    ).toBe(1);
    expect(sends).toEqual([{ restaurantId: shop.restaurantId, orderId: id }]);

    const saved = await db.order.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { options: true } }, statusEvents: true },
    });
    expect(saved).toMatchObject({
      customerId: shop.customerId,
      status: "PENDING",
      foodSubtotalMinor: 80_000n,
      discountMinor: 0n,
      deliveryFeeMinor: 10_000n,
      totalMinor: 90_000n,
      commissionRateBps: 1_000,
      commissionMinor: 8_000n,
      etaMinutes: 30,
      note: "ملاحظة الطلب",
      addressSnapshot: {
        street: "شارع الطلب",
        landmark: "معلم الطلب",
        neighborhoodName: "حي التوصيل",
      },
    });
    expect(saved.orderNumber).toMatch(/^BF-[0-9]{6}$/u);
    expect(saved.items).toMatchObject([
      {
        name: "الوجبة الأصلية",
        sizeName: "كبير",
        quantity: 2,
        unitPriceMinor: 40_000n,
        totalMinor: 80_000n,
        note: "ملاحظة الصنف",
        options: [{ name: "تتبيلة أصلية", priceMinor: 2_000n }],
      },
    ]);
    expect(saved.statusEvents).toMatchObject([
      {
        from: null,
        to: "PENDING",
        actorType: "CUSTOMER",
        actorId: shop.customerId,
      },
    ]);
    expect(await db.ledgerEntry.count({ where: { orderId: id } })).toBe(0);
    const current = await shop.get(id);
    expect(current.statusCode).toBe(200);

    await db.restaurant.update({
      where: { id: shop.restaurantId },
      data: { commissionRateBps: 8_000 },
    });
    await db.menuItem.update({
      where: { id: shop.itemId },
      data: { name: "اسم مختلف", deletedAt: test.clock.now },
    });
    await db.itemSize.update({
      where: { id: shop.sizeId },
      data: { name: "حجم مختلف", priceMinor: 1n },
    });
    await db.option.update({
      where: { id: shop.optionId },
      data: { name: "تتبيلة مختلفة", priceMinor: 9_000n },
    });
    await db.customerAddress.update({
      where: { id: shop.addressId },
      data: { street: "شارع لاحق" },
    });
    expect((await shop.get(id)).json()).toEqual(current.json());
    const replay = await shop.post(
      { ...shop.body, expectedTotalMinor: 1 },
      idempotencyKey,
    );
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(current.json());
    expect(sends).toHaveLength(1);
    expect(
      await db.order.findUniqueOrThrow({
        where: { id },
        select: { commissionMinor: true, commissionRateBps: true },
      }),
    ).toEqual({ commissionMinor: 8_000n, commissionRateBps: 1_000 });
  } finally {
    await api.close();
  }
}, 40_000);

it("returns the availability, zone, item, and option checks from the order contract", async () => {
  const test = openAuthTest();
  const { api, db } = test;
  try {
    const shop = await fixture(test);
    await db.restaurant.update({
      where: { id: shop.restaurantId },
      data: { status: "SUSPENDED" },
    });
    const closed = await shop.post();
    expect(closed.statusCode).toBe(409);
    expect(errorEnvelopeSchema.parse(closed.json()).error.code).toBe(
      "RESTAURANT_CLOSED",
    );
    await db.restaurant.update({
      where: { id: shop.restaurantId },
      data: { status: "APPROVED" },
    });
    const outOfZone = await shop.post({
      ...shop.body,
      addressId: shop.outsideAddressId,
    });
    expect(outOfZone.statusCode).toBe(409);
    expect(errorEnvelopeSchema.parse(outOfZone.json()).error.code).toBe(
      "OUT_OF_ZONE",
    );

    await db.menuItem.update({
      where: { id: shop.itemId },
      data: { availableFrom: "19:00", availableTo: "20:00" },
    });
    const unavailable = await shop.post();
    expect(unavailable.statusCode).toBe(409);
    expect(errorEnvelopeSchema.parse(unavailable.json()).error.code).toBe(
      "ITEM_UNAVAILABLE",
    );
    await db.menuItem.update({
      where: { id: shop.itemId },
      data: { availableFrom: null, availableTo: null },
    });
    const invalid = await shop.post({
      ...shop.body,
      items: [{ ...shop.line, optionIds: [] }],
    });
    expect(invalid.statusCode).toBe(409);
    expect(errorEnvelopeSchema.parse(invalid.json()).error.code).toBe(
      "INVALID_OPTIONS",
    );
    const duplicate = await shop.post({
      ...shop.body,
      items: [{ ...shop.line, optionIds: [shop.optionId, shop.optionId] }],
    });
    expect(duplicate.statusCode).toBe(409);
    expect(errorEnvelopeSchema.parse(duplicate.json()).error.code).toBe(
      "INVALID_OPTIONS",
    );
    const limited = await shop.post();
    expect(limited.statusCode).toBe(429);
    expect(errorEnvelopeSchema.parse(limited.json()).error.code).toBe(
      "RATE_LIMITED",
    );
    expect(limited.headers["retry-after"]).toBe("60");
    expect(
      await db.order.count({ where: { customerId: shop.customerId } }),
    ).toBe(0);
    test.clock.now = new Date(test.clock.now.getTime() + 60_000);
    expect((await shop.post()).statusCode).toBe(201);
  } finally {
    await api.close();
  }
}, 30_000);

it("checks minimum against food, returns updated price breakdown, and limits active orders per customer", async () => {
  const test = openAuthTest();
  const { api, db } = test;
  try {
    const shop = await fixture(test);
    await db.branch.update({
      where: { id: shop.branchId },
      data: { minOrderMinor: 85_000n },
    });
    const below = await shop.post();
    expect(below.statusCode).toBe(409);
    expect(errorEnvelopeSchema.parse(below.json()).error).toMatchObject({
      code: "BELOW_MINIMUM",
      details: { minOrderMinor: 85_000, foodSubtotalMinor: 80_000 },
    });
    await db.branch.update({
      where: { id: shop.branchId },
      data: { minOrderMinor: 40_000n },
    });
    await db.itemSize.update({
      where: { id: shop.sizeId },
      data: { priceMinor: 43_000n },
    });
    const key = randomUUID();
    const changed = await shop.post(shop.body, key);
    expect(changed.statusCode).toBe(409);
    expect(errorEnvelopeSchema.parse(changed.json()).error).toMatchObject({
      code: "PRICE_CHANGED",
      details: {
        foodSubtotalMinor: 90_000,
        discountMinor: 0,
        deliveryFeeMinor: 10_000,
        totalMinor: 100_000,
        items: [
          {
            menuItemId: shop.itemId,
            sizeId: shop.sizeId,
            quantity: 2,
            unitPriceMinor: 45_000,
            totalMinor: 90_000,
          },
        ],
      },
    });
    expect(
      await db.order.count({ where: { customerId: shop.customerId } }),
    ).toBe(0);
    const confirmed = await shop.post(
      { ...shop.body, expectedTotalMinor: 100_000 },
      key,
    );
    expect(confirmed.statusCode).toBe(201);
    const pickup = { ...shop.body, type: "PICKUP", expectedTotalMinor: 90_000 };
    const pickups = await Promise.all([shop.post(pickup), shop.post(pickup)]);
    expect(pickups.map(({ statusCode }) => statusCode).sort()).toEqual([
      201, 409,
    ]);
    const active = pickups.find(({ statusCode }) => statusCode === 409);
    if (!active) throw new Error("An order should exceed the active limit.");
    expect(errorEnvelopeSchema.parse(active.json()).error.code).toBe(
      "TOO_MANY_ACTIVE_ORDERS",
    );
    expect(
      await db.order.count({ where: { customerId: shop.customerId } }),
    ).toBe(2);
    const pickupRow = await db.order.findFirstOrThrow({
      where: { customerId: shop.customerId, type: "PICKUP" },
    });
    expect(pickupRow).toMatchObject({
      type: "PICKUP",
      etaMinutes: null,
      deliveryFeeMinor: 0n,
      addressSnapshot: null,
      totalMinor: 90_000n,
    });

    // A confirmed request remains replayable after all five attempts have been used.
    expect((await shop.post(shop.body, key)).statusCode).toBe(200);
  } finally {
    await api.close();
  }
}, 30_000);
