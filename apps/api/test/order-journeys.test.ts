import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  adminAuditLogSchema,
  adminRestaurantProfileSchema,
  authTokensSchema,
  browseListResponseSchema,
  citySchema,
  customerAddressSchema,
  customerProfileSchema,
  errorEnvelopeSchema,
  financeLedgerResponseSchema,
  foodCategorySchema,
  governorateSchema,
  ledgerEntrySchema,
  menuSectionPathSchema,
  neighborhoodSchema,
  orderReadSchema,
  publicRestaurantDetailResponseSchema,
  restaurantBalancesResponseSchema,
  restaurantDocumentSchema,
  restaurantImageUploadSchema,
  type OrderReadResponse,
} from "@be-fast/contracts";
import type { HTTPMethods } from "fastify";
import { generate, generateSecret } from "otplib";
import sharp from "sharp";
import { expect, it } from "vitest";
import { createAdmin } from "../prisma/admin-create.ts";
import { runOrderSweep } from "../src/orders/jobs.js";
import type { PushProvider } from "../src/orders/push.js";
import { LocalDiskStorageProvider } from "../src/storage/local.js";
import { openAuthTest } from "./auth-test-support.js";

type Test = ReturnType<typeof openAuthTest>;
type Transition = {
  to: OrderReadResponse["status"];
  prepMinutes?: number;
  reasonCode?: string;
};
const testTimeout = 90_000;
const commissionSetting = "commission.defaultRateBps";

function client(api: Test["api"], accessToken?: string) {
  return async (
    method: HTTPMethods,
    url: string,
    status: number,
    payload?: object,
    headers?: Record<string, string>,
  ) => {
    const response = await api.inject({
      method,
      url,
      payload,
      headers: {
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
    });
    expect(response.statusCode, `${method} ${url}`).toBe(status);
    return response;
  };
}

function multipartImage(bytes: Buffer) {
  const boundary = `be-fast-${randomUUID()}`;
  return {
    body: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

async function beginJourney(test: Test, suffix: 1 | 2) {
  const { api, db, clock, otpCodes } = test;
  const anonymous = client(api);
  const email = `journey-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const totpSecret = generateSecret();
  await createAdmin(db, { email, password, totpSecret });
  const adminLogin = await anonymous("POST", "/auth/admin/login", 200, {
    email,
    password,
    totp: await generate({
      secret: totpSecret,
      epoch: Math.floor(clock.now.getTime() / 1_000),
    }),
  });
  const admin = client(
    api,
    authTokensSchema.parse(adminLogin.json()).accessToken,
  );

  const [{ id: governorateId }, { id: categoryId }] = await Promise.all([
    admin("POST", "/admin/governorates", 201, {
      name: `محافظة الرحلة ${suffix}`,
    }).then((response) => governorateSchema.parse(response.json())),
    admin("POST", "/admin/categories", 201, {
      name: `تصنيف الرحلة ${suffix}`,
    }).then((response) => foodCategorySchema.parse(response.json())),
  ]);
  const city = citySchema.parse(
    (
      await admin("POST", "/admin/cities", 201, {
        governorateId,
        name: "مدينة الرحلة",
      })
    ).json(),
  );
  const { id: neighborhoodId } = neighborhoodSchema.parse(
    (
      await admin("POST", "/admin/neighborhoods", 201, {
        cityId: city.id,
        name: "حي الرحلة",
      })
    ).json(),
  );

  const phone = `+96399612000${suffix}`;
  await anonymous("POST", "/auth/restaurant/otp/request", 204, { phone });
  const code = otpCodes.get(phone);
  if (!code)
    throw new Error(
      "Expected the restaurant verification code in the development provider.",
    );
  const registration = await anonymous(
    "POST",
    "/auth/restaurant/register",
    201,
    { phone, code, password: randomUUID() },
  );
  const owner = client(
    api,
    authTokensSchema.parse(registration.json()).accessToken,
  );
  const restaurant = adminRestaurantProfileSchema.parse(
    (
      await owner("PATCH", "/restaurant/profile", 200, {
        name: `مطعم الرحلة ${suffix}`,
        contactPhone: phone,
        categoryIds: [categoryId],
        neighborhoodId,
        address: "عنوان فرع الرحلة",
      })
    ).json(),
  );
  expect(restaurant.status).toBe("DRAFT");
  if (!restaurant.branch)
    throw new Error("Expected the branch created by restaurant registration.");
  const branchId = restaurant.branch.id;

  await owner("PUT", "/restaurant/branch/opening-periods", 200, {
    periods: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      opensAt: "09:00",
      closesAt: "23:59",
    })),
  });
  await owner("PUT", "/restaurant/branch/delivery-zones", 200, {
    zones: [{ neighborhoodId, feeMinor: 10_000, etaMinutes: 30 }],
  });
  await owner("PATCH", "/restaurant/branch/settings", 200, {
    minOrderMinor: 40_000,
    pickupEnabled: true,
  });

  const image = await sharp({
    create: { width: 640, height: 420, channels: 3, background: "navy" },
  })
    .png()
    .toBuffer();
  const upload = (path: string) => {
    const { body, headers } = multipartImage(image);
    return owner("POST", path, 201, body, headers);
  };
  const logo = restaurantImageUploadSchema.parse(
    (await upload("/restaurant/profile/images/logo")).json(),
  );
  restaurantImageUploadSchema.parse(
    (await upload("/restaurant/profile/images/cover")).json(),
  );
  restaurantDocumentSchema.parse(
    (await upload("/restaurant/documents/LICENSE")).json(),
  );

  const pending = await owner("POST", "/restaurant/profile/submit", 200);
  expect(pending.json()).toEqual({ status: "PENDING_REVIEW" });
  const query = new URLSearchParams({ neighborhoodId });
  const list = async () =>
    browseListResponseSchema.parse(
      (await anonymous("GET", `/public/restaurants?${query}`, 200)).json(),
    ).restaurants;
  expect((await list()).some(({ id }) => id === restaurant.id)).toBe(false);
  await anonymous("GET", logo.images[320], 404);
  const approved = await admin(
    "POST",
    `/admin/restaurants/${restaurant.id}/approve`,
    200,
    { reason: "ملف التدقيق مكتمل" },
  );
  expect(approved.json()).toMatchObject({ status: "APPROVED" });
  await anonymous("GET", logo.images[320], 200);

  const section = await owner("POST", "/restaurant/menu/sections", 201, {
    name: "الوجبات",
  });
  const { sectionId } = menuSectionPathSchema.parse({
    sectionId: section.json<{ id: string }>().id,
  });
  const created = await owner("POST", "/restaurant/menu/items", 201, {
    sectionId,
    name: "وجبة الرحلة",
    sizes: [{ priceMinor: 38_000 }],
  });
  const { id: createdItemId } = created.json<{ id: string }>();
  await owner(
    "POST",
    `/restaurant/menu/items/${createdItemId}/option-groups`,
    201,
    {
      name: "التتبيلة",
      minSelect: 1,
      maxSelect: 1,
      options: [{ name: "تتبيلة إضافية", priceMinor: 2_000 }],
    },
  );
  await owner("PATCH", "/restaurant/branch/accepting-orders", 200, {
    acceptingOrders: true,
  });
  await owner("GET", "/restaurant/orders/active", 200);
  expect((await list()).find(({ id }) => id === restaurant.id)).toMatchObject({
    isOrderable: true,
    branchId,
    deliveryFeeMinor: 10_000,
  });

  const menu = publicRestaurantDetailResponseSchema.parse(
    (
      await anonymous(
        "GET",
        `/public/restaurants/${restaurant.id}?${query}`,
        200,
      )
    ).json(),
  );
  const item = menu.sections
    .flatMap(({ items }) => items)
    .find(({ id }) => id === createdItemId);
  const sizeId = item?.sizes[0]?.id;
  const optionId = item?.optionGroups[0]?.options[0]?.id;
  if (!item || !sizeId || !optionId)
    throw new Error("Expected the published size and required option.");
  const menuItemId = item.id;

  const customerPhone = `+96399712000${suffix}`;
  await anonymous("POST", "/auth/customer/otp/request", 204, {
    phone: customerPhone,
  });
  const customerCode = otpCodes.get(customerPhone);
  if (!customerCode)
    throw new Error(
      "Expected the customer verification code in the development provider.",
    );
  const login = await anonymous("POST", "/auth/customer/otp/verify", 200, {
    phone: customerPhone,
    code: customerCode,
  });
  const customer = client(
    api,
    authTokensSchema.parse(login.json()).accessToken,
  );
  const customerProfile = customerProfileSchema.parse(
    (
      await customer("PATCH", "/customer/me", 200, { name: "عميل الرحلة" })
    ).json(),
  );
  const address = customerAddressSchema.parse(
    (
      await customer("POST", "/customer/addresses", 201, {
        neighborhoodId,
        street: "شارع الرحلة",
        landmark: "معلم الرحلة",
      })
    ).json(),
  );

  async function place(type: "DELIVERY" | "PICKUP") {
    const delivery = type === "DELIVERY";
    return orderReadSchema.parse(
      (
        await customer(
          "POST",
          "/customer/orders",
          201,
          {
            branchId,
            type,
            ...(delivery ? { addressId: address.id } : {}),
            items: [
              {
                menuItemId,
                sizeId,
                optionIds: [optionId],
                quantity: delivery ? 2 : 1,
              },
            ],
            expectedTotalMinor: delivery ? 90_000 : 40_000,
          },
          { "idempotency-key": randomUUID() },
        )
      ).json(),
    );
  }

  async function transition(id: string, input: Transition) {
    const order = orderReadSchema.parse(
      (
        await owner("POST", `/restaurant/orders/${id}/transition`, 200, input)
      ).json(),
    );
    expect(order.status).toBe(input.to);
    return order;
  }

  async function advanceToReady(id: string) {
    const accepted = await transition(id, { to: "ACCEPTED", prepMinutes: 15 });
    await transition(id, { to: "PREPARING" });
    await transition(id, { to: "READY" });
    return accepted;
  }

  return {
    admin,
    customer,
    customerId: customerProfile.id,
    restaurant,
    place,
    transition,
    advanceToReady,
  };
}

async function withJourney(
  suffix: 1 | 2,
  run: (
    test: Test,
    journey: Awaited<ReturnType<typeof beginJourney>>,
  ) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "be-fast-order-journey-"));
  const test = openAuthTest({
    storage: new LocalDiskStorageProvider(directory),
  });
  try {
    const prior = await test.db.platformSetting.findUnique({
      where: { key: commissionSetting },
    });
    await test.db.platformSetting.upsert({
      where: { key: commissionSetting },
      create: { key: commissionSetting, value: 1_000 },
      update: { value: 1_000 },
    });
    try {
      await run(test, await beginJourney(test, suffix));
    } finally {
      if (prior) {
        await test.db
          .$executeRaw`UPDATE "PlatformSetting" SET "value" = ${JSON.stringify(prior.value)}::jsonb WHERE "key" = ${commissionSetting}`;
      } else {
        await test.db.platformSetting.delete({
          where: { key: commissionSetting },
        });
      }
    }
  } finally {
    try {
      await test.api.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

it(
  "completes registration, delivery, commission and settlement through the API",
  () =>
    withJourney(1, async ({ clock }, journey) => {
      const { admin, customer, restaurant, place, transition, advanceToReady } =
        journey;
      const order = await place("DELIVERY");
      expect(order).toMatchObject({
        type: "DELIVERY",
        status: "PENDING",
        foodSubtotalMinor: 80_000,
        deliveryFeeMinor: 10_000,
        totalMinor: 90_000,
      });

      const finance = `/admin/finance/restaurants/${restaurant.id}`;
      const ledger = async () =>
        financeLedgerResponseSchema.parse(
          (await admin("GET", `${finance}/ledger`, 200)).json(),
        ).entries;
      const balance = async () =>
        restaurantBalancesResponseSchema
          .parse((await admin("GET", "/admin/finance/restaurants", 200)).json())
          .restaurants.find(
            ({ restaurantId }) => restaurantId === restaurant.id,
          )?.balanceMinor;

      const accepted = await advanceToReady(order.id);
      expect(accepted.estimatedReadyAt).toBe(
        new Date(clock.now.getTime() + 15 * 60_000).toISOString(),
      );
      expect(accepted.estimatedDeliveryAt).toBe(
        new Date(clock.now.getTime() + 45 * 60_000).toISOString(),
      );
      await transition(order.id, { to: "OUT_FOR_DELIVERY" });
      expect(await ledger()).toEqual([]);
      expect(await balance()).toBe(0);

      await transition(order.id, { to: "DELIVERED" });
      await transition(order.id, { to: "DELIVERED" });
      const history = orderReadSchema.parse(
        (await customer("GET", `/customer/orders/${order.id}`, 200)).json(),
      );
      expect(history.events.map(({ to }) => to)).toEqual([
        "PENDING",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
      ]);
      expect(await ledger()).toEqual([
        expect.objectContaining({
          type: "COMMISSION_ACCRUED",
          orderId: order.id,
          amountMinor: 8_000,
        }),
      ]);
      expect(await balance()).toBe(8_000);

      const paid = ledgerEntrySchema.parse(
        (
          await admin("POST", `${finance}/payments`, 201, {
            amountMinor: 8_000,
            paymentDate: "2026-11-17",
            paymentMethod: "نقداً",
            reference: "إيصال الرحلة",
          })
        ).json(),
      );
      expect(paid).toMatchObject({
        type: "PAYMENT_RECEIVED",
        amountMinor: -8_000,
      });
      expect(await balance()).toBe(0);
      expect(
        (await ledger()).map(({ amountMinor }) => amountMinor).sort(),
      ).toEqual([-8_000, 8_000]);
      const log = adminAuditLogSchema.parse(
        (
          await admin("GET", `/admin/audit-log?entityId=${paid.id}`, 200)
        ).json(),
      );
      expect(log.entries).toEqual([
        expect.objectContaining({
          action: "LEDGER_PAYMENT_CREATE",
          entityId: paid.id,
        }),
      ]);
    }),
  testTimeout,
);

it(
  "handles rejection, customer cancellation, delivery failure, pickup and worker expiry through the API",
  () =>
    withJourney(2, async ({ api, db, clock }, journey) => {
      const {
        admin,
        customer,
        customerId,
        restaurant,
        place,
        transition,
        advanceToReady,
      } = journey;
      const read = async (id: string) =>
        orderReadSchema.parse(
          (await customer("GET", `/customer/orders/${id}`, 200)).json(),
        );

      const rejected = await place("DELIVERY");
      await transition(rejected.id, { to: "REJECTED", reasonCode: "TOO_BUSY" });
      expect((await read(rejected.id)).events.at(-1)).toMatchObject({
        to: "REJECTED",
        reasonCode: "TOO_BUSY",
        actorType: "RESTAURANT",
      });

      const cancelled = await place("DELIVERY");
      const cancellation = await customer(
        "POST",
        `/customer/orders/${cancelled.id}/cancel`,
        200,
      );
      expect(
        orderReadSchema.parse(cancellation.json()).events.at(-1),
      ).toMatchObject({ to: "CANCELLED", actorType: "CUSTOMER" });

      const failed = await place("DELIVERY");
      await advanceToReady(failed.id);
      await transition(failed.id, { to: "OUT_FOR_DELIVERY" });
      await transition(failed.id, {
        to: "DELIVERY_FAILED",
        reasonCode: "CUSTOMER_UNREACHABLE",
      });
      expect((await read(failed.id)).events.at(-1)).toMatchObject({
        to: "DELIVERY_FAILED",
        reasonCode: "CUSTOMER_UNREACHABLE",
      });

      const pickup = await place("PICKUP");
      expect(pickup).toMatchObject({
        type: "PICKUP",
        deliveryFeeMinor: 0,
        addressSnapshot: null,
        totalMinor: 40_000,
      });
      const readyForPickup = await advanceToReady(pickup.id);
      expect(readyForPickup.estimatedReadyAt).not.toBeNull();
      expect(readyForPickup.estimatedDeliveryAt).toBeNull();
      await transition(pickup.id, { to: "DELIVERED" });
      expect((await read(pickup.id)).events.map(({ to }) => to)).toEqual([
        "PENDING",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "DELIVERED",
      ]);

      const expiring = await place("DELIVERY");
      if (!expiring.pendingExpiresAt)
        throw new Error("Expected the deadline of a pending order.");
      const expiredNotices: string[] = [];
      const push: PushProvider = {
        async newOrder() {},
        async orderReminder() {},
        async orderStatusChanged(ownerId, orderId, status) {
          if (ownerId === customerId && status === "EXPIRED")
            expiredNotices.push(orderId);
        },
      };
      clock.now = new Date(expiring.pendingExpiresAt);
      await runOrderSweep({ db, now: () => clock.now, push, logger: api.log });
      expect(expiredNotices).toEqual([expiring.id]);
      const expired = await read(expiring.id);
      expect(expired.status).toBe("EXPIRED");
      expect(
        expired.events.map(({ to, actorType }) => ({ to, actorType })),
      ).toEqual([
        { to: "PENDING", actorType: "CUSTOMER" },
        { to: "EXPIRED", actorType: "SYSTEM" },
      ]);
      const lateCancellation = await customer(
        "POST",
        `/customer/orders/${expiring.id}/cancel`,
        409,
      );
      expect(
        errorEnvelopeSchema.parse(lateCancellation.json()).error.code,
      ).toBe("INVALID_TRANSITION");

      const finance = `/admin/finance/restaurants/${restaurant.id}/ledger`;
      const ledger = financeLedgerResponseSchema.parse(
        (await admin("GET", finance, 200)).json(),
      );
      expect(ledger.entries).toEqual([
        expect.objectContaining({
          type: "COMMISSION_ACCRUED",
          orderId: pickup.id,
          amountMinor: 4_000,
        }),
      ]);
    }),
  testTimeout,
);
