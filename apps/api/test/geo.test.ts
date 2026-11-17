import { randomUUID } from "node:crypto";
import {
  citySchema,
  errorEnvelopeSchema,
  foodCategorySchema,
  governorateSchema,
  neighborhoodSchema,
  publicFoodCategoriesSchema,
  publicGeoSchema,
} from "@be-fast/contracts";
import type { HTTPMethods } from "fastify";
import { expect, it } from "vitest";
import type { AdminRole } from "../src/generated/prisma/enums.ts";
import { openAuthTest } from "./auth-test-support.js";

async function signInAdmin(
  test: ReturnType<typeof openAuthTest>,
  role: AdminRole,
) {
  const { db, tokens, api } = test;
  const admin = await db.adminUser.create({
    data: {
      email: `${randomUUID()}@be-fast.example`,
      passwordHash: "unused",
      totpSecret: "unused",
      role,
    },
    select: { id: true },
  });
  const session = await tokens.issue({ aud: "admin", sub: admin.id, role });
  const headers = { authorization: `Bearer ${session.accessToken}` };
  function request(
    method: HTTPMethods,
    url: string,
    payload?: Record<string, unknown>,
  ) {
    return api.inject({ method, url, payload, headers });
  }
  return { adminId: admin.id, request };
}

it("serves an active geographic tree and preserves referenced areas when operations removes them", async () => {
  const test = openAuthTest();
  const { api, db } = test;
  try {
    const { adminId, request } = await signInAdmin(test, "OPERATIONS");
    const createdGovernorate = await request("POST", "/admin/governorates", {
      name: "محافظة اختبار",
    });
    expect(createdGovernorate.statusCode).toBe(201);
    const governorate = governorateSchema.parse(createdGovernorate.json());
    const govPath = `/admin/governorates/${governorate.id}`;

    const createdCity = await request("POST", "/admin/cities", {
      name: "مدينة اختبار",
      governorateId: governorate.id,
    });
    expect(createdCity.statusCode).toBe(201);
    const city = citySchema.parse(createdCity.json());
    const cityPath = `/admin/cities/${city.id}`;

    const createdNeighborhood = await request("POST", "/admin/neighborhoods", {
      name: "حي اختبار",
      cityId: city.id,
    });
    expect(createdNeighborhood.statusCode).toBe(201);
    const neighborhood = neighborhoodSchema.parse(createdNeighborhood.json());
    const neighborhoodPath = `/admin/neighborhoods/${neighborhood.id}`;

    const changedCity = await request("PATCH", cityPath, {
      name: "مدينة معدلة",
    });
    expect(changedCity.statusCode).toBe(200);
    expect(citySchema.parse(changedCity.json()).name).toBe("مدينة معدلة");
    expect(
      (
        await request("GET", `/admin/cities?governorateId=${governorate.id}`)
      ).json(),
    ).toEqual([changedCity.json()]);
    expect(
      (await request("GET", `/admin/neighborhoods?cityId=${city.id}`)).json(),
    ).toEqual([neighborhood]);
    expect((await request("GET", neighborhoodPath)).json()).toEqual(
      neighborhood,
    );
    const tree = async () => {
      const result = await api.inject({ method: "GET", url: "/public/geo" });
      expect(result.statusCode).toBe(200);
      return publicGeoSchema
        .parse(result.json())
        .find(({ id }) => id === governorate.id);
    };
    expect(await tree()).toEqual({
      id: governorate.id,
      name: governorate.name,
      cities: [
        {
          id: city.id,
          name: "مدينة معدلة",
          neighborhoods: [{ id: neighborhood.id, name: neighborhood.name }],
        },
      ],
    });

    const customer = await db.customer.create({
      data: {},
      select: { id: true },
    });
    const address = await db.customerAddress.create({
      data: {
        customerId: customer.id,
        neighborhoodId: neighborhood.id,
        street: "شارع الاختبار",
        landmark: "المعلم التجريبي",
      },
      select: { id: true },
    });
    const removedNeighborhood = await request("DELETE", neighborhoodPath);
    expect(removedNeighborhood.statusCode).toBe(200);
    expect(neighborhoodSchema.parse(removedNeighborhood.json()).isActive).toBe(
      false,
    );
    expect((await tree())?.cities[0]?.neighborhoods).toEqual([]);
    expect(
      (
        await db.customerAddress.findUniqueOrThrow({
          where: { id: address.id },
        })
      ).neighborhoodId,
    ).toBe(neighborhood.id);

    const removedCity = await request("DELETE", cityPath);
    expect(removedCity.statusCode).toBe(200);
    expect(citySchema.parse(removedCity.json()).isActive).toBe(false);
    expect((await tree())?.cities).toEqual([]);
    const activateChild = await request("PATCH", neighborhoodPath, {
      isActive: true,
    });
    expect(activateChild.statusCode).toBe(409);
    expect(
      errorEnvelopeSchema.parse(activateChild.json()).error.details,
    ).toEqual({ reason: "INACTIVE_PARENT" });

    const removedGovernorate = await request("DELETE", govPath);
    expect(removedGovernorate.statusCode).toBe(200);
    expect(governorateSchema.parse(removedGovernorate.json()).isActive).toBe(
      false,
    );
    expect(await tree()).toBeUndefined();
    expect(
      (
        await request("POST", "/admin/cities", {
          name: "مدينة تحت محافظة معطلة",
          governorateId: governorate.id,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request("POST", "/admin/neighborhoods", {
          name: "حي بلا مدينة",
          cityId: randomUUID(),
        })
      ).statusCode,
    ).toBe(404);

    const events = await db.auditLog.findMany({
      where: {
        adminUserId: adminId,
        entityId: { in: [governorate.id, city.id, neighborhood.id] },
      },
      select: { action: true, before: true, after: true },
    });
    expect(events.map(({ action }) => action).sort()).toEqual([
      "CITY_CREATED",
      "CITY_DEACTIVATED",
      "CITY_UPDATED",
      "GOVERNORATE_CREATED",
      "GOVERNORATE_DEACTIVATED",
      "NEIGHBORHOOD_CREATED",
      "NEIGHBORHOOD_DEACTIVATED",
    ]);
    expect(events.find(({ action }) => action === "CITY_UPDATED")).toEqual({
      action: "CITY_UPDATED",
      before: city,
      after: { ...city, name: "مدينة معدلة" },
    });
  } finally {
    await api.close();
  }
}, 30_000);

it("restricts category management to authorized roles and distinguishes deactivation from removal", async () => {
  const test = openAuthTest();
  const { api, db } = test;
  try {
    const support = await signInAdmin(test, "SUPPORT");
    expect((await support.request("GET", "/admin/categories")).statusCode).toBe(
      403,
    );
    expect(
      (
        await support.request("POST", "/admin/categories", {
          name: "تصنيف اختبار",
        })
      ).statusCode,
    ).toBe(403);

    const { adminId, request } = await signInAdmin(test, "SUPER_ADMIN");
    const categoryOne = await request("POST", "/admin/categories", {
      name: "تصنيف مستخدم",
      sortOrder: 2,
      icon: "burger",
    });
    expect(categoryOne.statusCode).toBe(201);
    const used = foodCategorySchema.parse(categoryOne.json());
    const categoryTwo = await request("POST", "/admin/categories", {
      name: "تصنيف غير مستخدم",
      sortOrder: 1,
    });
    expect(categoryTwo.statusCode).toBe(201);
    const unused = foodCategorySchema.parse(categoryTwo.json());
    const usedPath = `/admin/categories/${used.id}`;
    const unusedPath = `/admin/categories/${unused.id}`;

    const listed = async () => {
      const response = await api.inject({
        method: "GET",
        url: "/public/categories",
      });
      expect(response.statusCode).toBe(200);
      return publicFoodCategoriesSchema
        .parse(response.json())
        .filter(({ id }) => [used.id, unused.id].includes(id));
    };
    expect((await listed()).map(({ id }) => id)).toEqual([unused.id, used.id]);
    const changed = await request("PATCH", usedPath, {
      icon: null,
      sortOrder: 0,
    });
    expect(changed.statusCode).toBe(200);
    expect(foodCategorySchema.parse(changed.json()).icon).toBeNull();
    expect((await listed()).map(({ id }) => id)).toEqual([used.id, unused.id]);

    const restaurant = await db.restaurant.create({
      data: { commissionRateBps: 0 },
      select: { id: true },
    });
    await db.restaurantCategory.create({
      data: { restaurantId: restaurant.id, categoryId: used.id },
    });
    const deactivated = await request("DELETE", usedPath);
    expect(deactivated.statusCode).toBe(200);
    expect(foodCategorySchema.parse(deactivated.json()).isActive).toBe(false);
    expect(
      await db.restaurantCategory.count({
        where: { restaurantId: restaurant.id, categoryId: used.id },
      }),
    ).toBe(1);

    expect((await request("DELETE", unusedPath)).statusCode).toBe(204);
    expect((await request("GET", unusedPath)).statusCode).toBe(404);
    expect(await listed()).toEqual([]);
    expect(
      foodCategorySchema.parse((await request("GET", usedPath)).json())
        .isActive,
    ).toBe(false);

    const events = await db.auditLog.findMany({
      where: { adminUserId: adminId },
      select: { action: true, entityType: true, before: true, after: true },
    });
    expect(events.map(({ action }) => action).sort()).toEqual([
      "FOOD_CATEGORY_CREATED",
      "FOOD_CATEGORY_CREATED",
      "FOOD_CATEGORY_DEACTIVATED",
      "FOOD_CATEGORY_DELETED",
      "FOOD_CATEGORY_UPDATED",
    ]);
    expect(
      events.find(({ action }) => action === "FOOD_CATEGORY_DELETED"),
    ).toEqual({
      action: "FOOD_CATEGORY_DELETED",
      entityType: "FoodCategory",
      before: unused,
      after: null,
    });
  } finally {
    await api.close();
  }
}, 30_000);
