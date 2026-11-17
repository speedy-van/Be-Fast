import { publicRestaurantDetailResponseSchema } from "@be-fast/contracts";
import { describe, expect, it } from "vitest";
import { openAuthTest } from "./auth-test-support.js";

type BrowseTest = ReturnType<typeof openAuthTest>;
const integrationTimeoutMs = 30_000;

async function withBrowseTest(run: (test: BrowseTest) => Promise<void>) {
  const test = openAuthTest();
  try {
    await run(test);
  } finally {
    await test.api.close();
  }
}

async function createRestaurant({ db, clock }: BrowseTest) {
  const neighborhood = await db.neighborhood.create({
    data: {
      name: "Served",
      city: {
        create: {
          name: "Demo city",
          governorate: { create: { name: "Demo area" } },
        },
      },
    },
  });
  const restaurant = await db.restaurant.create({
    data: {
      name: "Night kitchen",
      status: "APPROVED",
      commissionRateBps: 1000,
      reviewReason: "Internal fixture note",
      categories: {
        create: [
          {
            category: {
              create: { name: "Live category", icon: "kitchen", sortOrder: 1 },
            },
          },
          {
            category: { create: { name: "Hidden category", isActive: false } },
          },
        ],
      },
      documents: {
        create: { storageKey: `fixture/${neighborhood.id}`, type: "LICENSE" },
      },
      branch: {
        create: {
          acceptingOrders: true,
          pickupEnabled: true,
          lastSeenAt: clock.now,
          minOrderMinor: 20_000n,
          openingPeriods: {
            create: { dayOfWeek: 2, opensAt: "18:00", closesAt: "02:00" },
          },
          deliveryZones: {
            create: {
              neighborhoodId: neighborhood.id,
              feeMinor: 3000n,
              etaMinutes: 35,
            },
          },
        },
      },
    },
    include: { branch: { select: { id: true } } },
  });
  if (!restaurant.branch) throw new Error("Expected a fixture branch.");
  return { restaurant, neighborhood, branchId: restaurant.branch.id };
}

function getDetail({ api }: BrowseTest, id: string, neighborhoodId: string) {
  return api.inject({
    method: "GET",
    url: `/public/restaurants/${id}?neighborhoodId=${neighborhoodId}`,
  });
}

async function readDetail(
  test: BrowseTest,
  id: string,
  neighborhoodId: string,
) {
  const response = await getDetail(test, id, neighborhoodId);
  expect(response.statusCode).toBe(200);
  return publicRestaurantDetailResponseSchema.parse(response.json());
}

describe("public restaurant detail", () => {
  it(
    "returns only restaurants that are approved and serve an active neighborhood",
    () =>
      withBrowseTest(async (test) => {
        const { restaurant, neighborhood } = await createRestaurant(test);
        const unserved = await test.db.neighborhood.create({
          data: { name: "Unserved", cityId: neighborhood.cityId },
        });
        expect(
          (await getDetail(test, restaurant.id, neighborhood.id)).statusCode,
        ).toBe(200);
        expect(
          (await getDetail(test, restaurant.id, unserved.id)).statusCode,
        ).toBe(404);

        for (const status of [
          "DRAFT",
          "PENDING_REVIEW",
          "REJECTED",
          "SUSPENDED",
        ] as const) {
          await test.db.restaurant.update({
            where: { id: restaurant.id },
            data: { status },
          });
          const response = await getDetail(
            test,
            restaurant.id,
            neighborhood.id,
          );
          expect(response.statusCode).toBe(404);
          expect(response.json().error.code).toBe("NOT_FOUND");
        }

        await test.db.restaurant.update({
          where: { id: restaurant.id },
          data: { status: "APPROVED" },
        });
        await test.db.neighborhood.update({
          where: { id: neighborhood.id },
          data: { isActive: false },
        });
        expect(
          (await getDetail(test, restaurant.id, neighborhood.id)).statusCode,
        ).toBe(404);
      }),
    integrationTimeoutMs,
  );

  it(
    "lists the whole live menu and calculates availability across Damascus midnight",
    () =>
      withBrowseTest(async (test) => {
        test.clock.now = new Date("2026-11-17T22:30:00.000Z");
        const { restaurant, neighborhood, branchId } =
          await createRestaurant(test);
        const deletedAt = test.clock.now;
        const section = await test.db.menuSection.create({
          data: {
            restaurantId: restaurant.id,
            name: "Dinner",
            sortOrder: 1,
            items: {
              create: [
                {
                  name: "Night meal",
                  sortOrder: 1,
                  description: "Served at night",
                  availableFrom: "18:00",
                  availableTo: "02:00",
                  sizes: {
                    create: [
                      { name: "Regular", priceMinor: 23_000n },
                      { name: "Hidden size", priceMinor: 25_000n, deletedAt },
                    ],
                  },
                  optionGroups: {
                    create: [
                      {
                        name: "Seasonings",
                        minSelect: 0,
                        maxSelect: 2,
                        sortOrder: 1,
                        options: {
                          create: [
                            { name: "Herbs", priceMinor: 100n, sortOrder: 1 },
                            {
                              name: "Pepper",
                              priceMinor: 200n,
                              sortOrder: 2,
                              isAvailable: false,
                            },
                            {
                              name: "Hidden option",
                              priceMinor: 300n,
                              sortOrder: 3,
                              deletedAt,
                            },
                          ],
                        },
                      },
                      {
                        name: "Hidden group",
                        minSelect: 0,
                        maxSelect: 0,
                        deletedAt,
                      },
                    ],
                  },
                },
                {
                  name: "Breakfast",
                  sortOrder: 2,
                  availableFrom: "06:00",
                  availableTo: "10:00",
                  sizes: { create: { name: "Regular", priceMinor: 20_000n } },
                },
                {
                  name: "Paused meal",
                  sortOrder: 3,
                  isAvailable: false,
                  sizes: { create: { name: "Regular", priceMinor: 21_000n } },
                },
                {
                  name: "Without a live size",
                  sortOrder: 4,
                  sizes: {
                    create: {
                      name: "Hidden size",
                      priceMinor: 21_000n,
                      deletedAt,
                    },
                  },
                },
                {
                  name: "Hidden item",
                  deletedAt,
                  sizes: { create: { name: "Regular", priceMinor: 21_000n } },
                },
              ],
            },
          },
        });
        await test.db.menuSection.create({
          data: {
            restaurantId: restaurant.id,
            name: "Hidden section",
            deletedAt,
          },
        });

        const response = await readDetail(test, restaurant.id, neighborhood.id);
        expect(response).toMatchObject({
          id: restaurant.id,
          branchId,
          deliveryFeeMinor: 3000,
          minOrderMinor: 20_000,
          etaMinutes: 35,
          pickupEnabled: true,
          isOrderable: true,
          reason: null,
          currencyDisplayMode: "OLD",
        });
        expect(response.categories.map(({ name }) => name)).toEqual([
          "Live category",
        ]);
        expect(response.sections.map(({ id }) => id)).toEqual([section.id]);
        const items = response.sections.flatMap(({ items }) => items);
        expect(
          items.map(({ name, isAvailable }) => [name, isAvailable]),
        ).toEqual([
          ["Night meal", true],
          ["Breakfast", false],
          ["Paused meal", false],
          ["Without a live size", false],
        ]);
        const dinner = items[0];
        expect(dinner?.sizes).toMatchObject([
          { name: "Regular", priceMinor: 23_000 },
        ]);
        expect(dinner?.optionGroups).toMatchObject([
          {
            name: "Seasonings",
            minSelect: 0,
            maxSelect: 2,
            options: [
              { name: "Herbs", priceMinor: 100, isAvailable: true },
              { name: "Pepper", priceMinor: 200, isAvailable: false },
            ],
          },
        ]);

        test.clock.now = new Date("2026-11-17T23:00:00.000Z");
        const closed = await readDetail(test, restaurant.id, neighborhood.id);
        expect(closed).toMatchObject({ isOrderable: false, reason: "CLOSED" });
        expect(closed.sections[0]?.items[0]?.isAvailable).toBe(false);
      }),
    integrationTimeoutMs,
  );

  it(
    "retains public details while paused, offline, or without any available item",
    () =>
      withBrowseTest(async (test) => {
        test.clock.now = new Date("2026-11-17T22:30:00.000Z");
        const { restaurant, neighborhood, branchId } =
          await createRestaurant(test);
        const detail = () => readDetail(test, restaurant.id, neighborhood.id);
        expect(await detail()).toMatchObject({
          isOrderable: false,
          reason: "NO_AVAILABLE_ITEMS",
        });

        await test.db.branch.update({
          where: { id: branchId },
          data: { acceptingOrders: false },
        });
        expect(await detail()).toMatchObject({
          isOrderable: false,
          reason: "PAUSED",
        });

        const lastSeenAt = new Date(test.clock.now.getTime() - 120_001);
        await test.db.branch.update({
          where: { id: branchId },
          data: { acceptingOrders: true, lastSeenAt },
        });
        expect(await detail()).toMatchObject({
          isOrderable: false,
          reason: "OFFLINE",
        });
      }),
    integrationTimeoutMs,
  );
});
