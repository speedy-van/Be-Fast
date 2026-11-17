import { randomUUID } from "node:crypto";
import { browseListResponseSchema } from "@be-fast/contracts";
import { describe, expect, it } from "vitest";
import type { RestaurantStatus } from "../src/generated/prisma/enums.ts";
import { openAuthTest } from "./auth-test-support.js";

type Test = ReturnType<typeof openAuthTest>;
const integrationTimeout = 30_000;
const listPath = "/public/restaurants";

interface RestaurantFixture {
  name: string;
  status?: RestaurantStatus;
  acceptingOrders?: boolean;
  closed?: boolean;
  lastSeenAt?: Date | null;
  itemName?: string;
  itemDeleted?: boolean;
  itemSectionDeleted?: boolean;
  itemOutsideItsWindow?: boolean;
  categoryId?: string;
}

async function createNeighborhood(test: Test) {
  return test.db.neighborhood.create({
    data: {
      name: `Neighborhood ${randomUUID()}`,
      city: {
        create: {
          name: "City fixture",
          governorate: { create: { name: "Governorate fixture" } },
        },
      },
    },
  });
}

async function createRestaurants(
  test: Test,
  neighborhoodId: string,
  restaurants: RestaurantFixture[],
) {
  const fixture = restaurants.map((restaurant) => ({
    ...restaurant,
    id: randomUUID(),
    branchId: randomUUID(),
    sectionId: randomUUID(),
    itemId: randomUUID(),
  }));
  await test.db.$transaction(
    async (tx) => {
      await tx.restaurant.createMany({
        data: fixture.map(({ id, name, status }) => ({
          id,
          name,
          status: status ?? "APPROVED",
          commissionRateBps: 1_000,
        })),
      });
      await tx.branch.createMany({
        data: fixture.map(({ id, branchId, acceptingOrders, lastSeenAt }) => ({
          id: branchId,
          restaurantId: id,
          acceptingOrders: acceptingOrders ?? true,
          lastSeenAt: lastSeenAt === undefined ? test.clock.now : lastSeenAt,
          minOrderMinor: 2_800n,
        })),
      });
      await tx.deliveryZone.createMany({
        data: fixture.map(({ branchId }) => ({
          branchId,
          neighborhoodId,
          feeMinor: 1_500n,
          etaMinutes: 35,
        })),
      });
      await tx.openingPeriod.createMany({
        data: fixture.map(({ branchId, closed }) => ({
          branchId,
          dayOfWeek: test.clock.now.getUTCDay(),
          opensAt: closed ? "01:00" : "10:00",
          closesAt: closed ? "02:00" : "14:00",
        })),
      });
      await tx.menuSection.createMany({
        data: fixture.map(({ id, sectionId, itemSectionDeleted }) => ({
          id: sectionId,
          restaurantId: id,
          name: "Fixture section",
          deletedAt: itemSectionDeleted ? test.clock.now : null,
        })),
      });
      await tx.menuItem.createMany({
        data: fixture.map(
          ({
            itemId,
            sectionId,
            itemName,
            itemDeleted,
            itemOutsideItsWindow,
          }) => ({
            id: itemId,
            sectionId,
            name: itemName ?? "Fixture item",
            deletedAt: itemDeleted ? test.clock.now : null,
            availableFrom: itemOutsideItsWindow ? "18:00" : null,
            availableTo: itemOutsideItsWindow ? "22:00" : null,
          }),
        ),
      });
      await tx.itemSize.createMany({
        data: fixture.map(({ itemId }) => ({
          menuItemId: itemId,
          name: "Fixture size",
          priceMinor: 3_000n,
        })),
      });
      const categories = fixture.flatMap(({ id, categoryId }) =>
        categoryId ? [{ restaurantId: id, categoryId }] : [],
      );
      if (categories.length > 0)
        await tx.restaurantCategory.createMany({ data: categories });
    },
    { timeout: 15_000 },
  );
  return fixture;
}

async function list(
  test: Test,
  neighborhoodId: string,
  filters: Record<string, string> = {},
) {
  const query = new URLSearchParams({ neighborhoodId, ...filters });
  const response = await test.api.inject({
    method: "GET",
    url: `${listPath}?${query}`,
  });
  expect(response.statusCode, response.body).toBe(200);
  return browseListResponseSchema.parse(response.json());
}

describe("public restaurant listing", () => {
  it(
    "includes only approved restaurants serving the neighborhood, with current availability and category filtering",
    async () => {
      const test = openAuthTest();
      try {
        const neighborhood = await createNeighborhood(test);
        const outside = await createNeighborhood(test);
        const category = await test.db.foodCategory.create({
          data: { name: "Category fixture", icon: "fixture", sortOrder: 1 },
        });
        await createRestaurants(test, outside.id, [{ name: "Outside" }]);
        await createRestaurants(test, neighborhood.id, [
          { name: "Closed", closed: true },
          {
            name: "Available",
            categoryId: category.id,
            lastSeenAt: new Date(test.clock.now.getTime() - 120_000),
          },
          { name: "Paused", acceptingOrders: false },
          {
            name: "Offline",
            lastSeenAt: new Date(test.clock.now.getTime() - 120_001),
          },
          { name: "Outside item window", itemOutsideItsWindow: true },
          { name: "Draft", status: "DRAFT" },
          { name: "Pending", status: "PENDING_REVIEW" },
          { name: "Rejected", status: "REJECTED" },
          { name: "Suspended", status: "SUSPENDED" },
        ]);

        const result = await list(test, neighborhood.id);
        expect(result.nextCursor).toBeNull();
        expect(result.restaurants[0]).toMatchObject({
          name: "Available",
          reason: null,
          isOrderable: true,
          deliveryFeeMinor: 1_500,
          minOrderMinor: 2_800,
          etaMinutes: 35,
          categories: [
            {
              id: category.id,
              name: category.name,
              icon: category.icon,
              sortOrder: 1,
            },
          ],
        });
        expect(
          new Map(
            result.restaurants.map(({ name, reason, isOrderable }) => [
              name,
              { reason, isOrderable },
            ]),
          ),
        ).toEqual(
          new Map([
            ["Available", { reason: null, isOrderable: true }],
            ["Closed", { reason: "CLOSED", isOrderable: false }],
            ["Paused", { reason: "PAUSED", isOrderable: false }],
            ["Offline", { reason: "OFFLINE", isOrderable: false }],
            [
              "Outside item window",
              { reason: "NO_AVAILABLE_ITEMS", isOrderable: false },
            ],
          ]),
        );

        expect(
          (
            await list(test, neighborhood.id, { categoryId: category.id })
          ).restaurants.map(({ name }) => name),
        ).toEqual(["Available"]);
        await test.db.foodCategory.update({
          where: { id: category.id },
          data: { isActive: false },
        });
        expect(
          (await list(test, neighborhood.id, { categoryId: category.id }))
            .restaurants,
        ).toEqual([]);
        await test.db.neighborhood.update({
          where: { id: neighborhood.id },
          data: { isActive: false },
        });
        expect((await list(test, neighborhood.id)).restaurants).toEqual([]);
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "normalizes the query and current Arabic restaurant and dish names symmetrically",
    async () => {
      const test = openAuthTest();
      try {
        const neighborhood = await createNeighborhood(test);
        await createRestaurants(test, neighborhood.id, [
          { name: "مطعم أحمد", itemName: "شَـاوَرْمَة" },
          { name: "مطعم خالد", itemName: "شاورما" },
          { name: "وجبات عربية", itemName: "فتة موسى" },
          { name: "Deleted item", itemName: "شاورما", itemDeleted: true },
          {
            name: "Deleted section",
            itemName: "شاورما",
            itemSectionDeleted: true,
          },
        ]);

        for (const q of ["شاورما", "شاورمة", "شَـاوَرْمَة"]) {
          const result = await list(test, neighborhood.id, { q });
          expect(result.restaurants.map(({ name }) => name).sort()).toEqual([
            "مطعم أحمد",
            "مطعم خالد",
          ]);
        }
        for (const q of ["احمد", "إحْمَد", "آحمد"]) {
          expect(
            (await list(test, neighborhood.id, { q })).restaurants.map(
              ({ name }) => name,
            ),
          ).toEqual(["مطعم أحمد"]);
        }
        expect(
          (
            await list(test, neighborhood.id, { q: "فته موسي" })
          ).restaurants.map(({ name }) => name),
        ).toEqual(["وجبات عربية"]);
        expect(
          (await list(test, neighborhood.id, { q: "%" })).restaurants,
        ).toEqual([]);
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "uses a 20-item availability-first cursor and a fixed number of SQL queries",
    async () => {
      const sql: string[] = [];
      const test = openAuthTest({
        onQuery: (statement) => sql.push(statement),
      });
      try {
        const singleNeighborhood = await createNeighborhood(test);
        const manyNeighborhood = await createNeighborhood(test);
        const category = await test.db.foodCategory.create({
          data: { name: "Category fixture" },
        });
        await createRestaurants(test, singleNeighborhood.id, [
          { name: "One", categoryId: category.id },
        ]);
        const fixture = await createRestaurants(
          test,
          manyNeighborhood.id,
          Array.from({ length: 23 }, (_, index) => ({
            name: `Restaurant ${index}`,
            categoryId: category.id,
            acceptingOrders: index < 12,
          })),
        );

        expect(
          (await list(test, singleNeighborhood.id)).restaurants,
        ).toHaveLength(1);
        const singleCount = sql.length;
        expect(singleCount).toBeGreaterThan(0);
        sql.length = 0;
        const first = await list(test, manyNeighborhood.id);
        expect(first.restaurants).toHaveLength(20);
        expect(sql).toHaveLength(singleCount);
        expect(singleCount).toBeLessThanOrEqual(9);
        expect(first.restaurants.map(({ isOrderable }) => isOrderable)).toEqual(
          [...Array<boolean>(12).fill(true), ...Array<boolean>(8).fill(false)],
        );
        if (first.nextCursor === null)
          throw new Error("Expected a cursor for the next restaurant page.");

        const second = await list(test, manyNeighborhood.id, {
          cursor: first.nextCursor,
        });
        expect(second.restaurants).toHaveLength(3);
        expect(second.nextCursor).toBeNull();
        expect(
          second.restaurants.every(({ isOrderable }) => !isOrderable),
        ).toBe(true);
        expect(
          [...first.restaurants, ...second.restaurants]
            .map(({ id }) => id)
            .sort(),
        ).toEqual(fixture.map(({ id }) => id).sort());
        const malformed = await test.api.inject({
          method: "GET",
          url: `${listPath}?neighborhoodId=${manyNeighborhood.id}&cursor=invalid`,
        });
        expect(malformed.statusCode).toBe(400);
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );
});
