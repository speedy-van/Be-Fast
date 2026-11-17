import { randomUUID } from "node:crypto";
import {
  customerAddressListSchema,
  customerAddressSchema,
  customerProfileSchema,
  errorEnvelopeSchema,
} from "@be-fast/contracts";
import type { HTTPMethods } from "fastify";
import { expect, it } from "vitest";
import { openAuthTest } from "./auth-test-support.js";

const path = "/customer/addresses";

async function fixtureCustomer(test: ReturnType<typeof openAuthTest>) {
  const { db, tokens, api } = test;
  const customer = await db.customer.create({ data: {}, select: { id: true } });
  const { accessToken } = await tokens.issue({
    aud: "customer",
    sub: customer.id,
  });
  const headers = { authorization: `Bearer ${accessToken}` };
  return {
    id: customer.id,
    request: (
      method: HTTPMethods,
      url: string,
      payload?: Record<string, unknown>,
    ) => api.inject({ method, url, payload, headers }),
  };
}

async function fixtureGeography(test: ReturnType<typeof openAuthTest>) {
  const area = await test.db.governorate.create({
    data: {
      name: "محافظة اختبار العناوين",
      cities: {
        create: {
          name: "مدينة اختبار العناوين",
          neighborhoods: { create: { name: "حي اختبار العناوين" } },
        },
      },
    },
    select: {
      id: true,
      cities: { select: { neighborhoods: { select: { id: true } } } },
    },
  });
  const neighborhoodId = area.cities[0]?.neighborhoods[0]?.id;
  if (!neighborhoodId)
    throw new Error("Could not create the address test geography.");
  return { governorateId: area.id, neighborhoodId };
}

it("scopes reading, changing, selecting and deleting an address to the signed-in customer", async () => {
  const test = openAuthTest();
  try {
    const [first, second, area] = await Promise.all([
      fixtureCustomer(test),
      fixtureCustomer(test),
      fixtureGeography(test),
    ]);
    const body = {
      neighborhoodId: area.neighborhoodId,
      street: "شارع صاحب العنوان",
      landmark: "المعلم التجريبي",
    };
    const create = await second.request("POST", path, body);
    expect(create.statusCode).toBe(201);
    const address = customerAddressSchema.parse(create.json());
    const detail = `${path}/${address.id}`;
    expect(address.isDefault).toBe(true);
    expect(
      (await first.request("POST", path, { ...body, customerId: second.id }))
        .statusCode,
    ).toBe(400);
    expect(
      customerAddressListSchema.parse(
        (await first.request("GET", path)).json(),
      ),
    ).toEqual([]);
    const forbidden = await Promise.all([
      first.request("GET", detail),
      first.request("PATCH", detail, { street: "شارع من حساب آخر" }),
      first.request("PATCH", `${detail}/default`),
      first.request("DELETE", detail),
    ]);
    for (const result of forbidden) {
      expect(result.statusCode).toBe(404);
      expect(errorEnvelopeSchema.parse(result.json()).error.code).toBe(
        "NOT_FOUND",
      );
    }
    expect(
      customerAddressSchema.parse((await second.request("GET", detail)).json()),
    ).toEqual(address);
    expect(
      await test.db.customerAddress.count({ where: { customerId: second.id } }),
    ).toBe(1);

    const profile = customerProfileSchema.parse(
      (await first.request("GET", "/customer/me")).json(),
    );
    expect(profile).toEqual({ id: first.id, name: null, phone: null });
    expect(
      (
        await first.request("PATCH", "/customer/me", {
          name: "  عميل الاختبار  ",
          customerId: second.id,
        })
      ).statusCode,
    ).toBe(400);
    const names = ["عميل الاختبار", "اسم آخر"];
    const updates = await Promise.all(
      names.map((name) => first.request("PATCH", "/customer/me", { name })),
    );
    expect(updates.map(({ statusCode }) => statusCode).sort()).toEqual([
      200, 409,
    ]);
    const selectedName =
      names[updates.findIndex(({ statusCode }) => statusCode === 200)];
    const repeated = await first.request("PATCH", "/customer/me", {
      name: selectedName,
    });
    expect(repeated.statusCode).toBe(200);
    expect(customerProfileSchema.parse(repeated.json())).toEqual({
      ...profile,
      name: selectedName,
    });
    expect(
      customerProfileSchema.parse(
        (await second.request("GET", "/customer/me")).json(),
      ),
    ).toEqual({ id: second.id, name: null, phone: null });
  } finally {
    await test.api.close();
  }
}, 25_000);

it("preserves one default through concurrent saves and validates geography and paired coordinates", async () => {
  const test = openAuthTest();
  try {
    const [customer, area] = await Promise.all([
      fixtureCustomer(test),
      fixtureGeography(test),
    ]);
    const { request } = customer;
    const base = {
      neighborhoodId: area.neighborhoodId,
      street: "شارع الاختبار",
      landmark: "المعلم التجريبي",
    };
    expect(
      (await request("POST", path, { ...base, latitude: 4 })).statusCode,
    ).toBe(400);
    expect(
      (await request("POST", path, { ...base, latitude: 91, longitude: 3 }))
        .statusCode,
    ).toBe(400);
    expect(
      (await request("POST", path, { ...base, latitude: null, longitude: 3 }))
        .statusCode,
    ).toBe(400);
    expect(
      (await request("POST", path, { ...base, neighborhoodId: randomUUID() }))
        .statusCode,
    ).toBe(400);

    const responses = await Promise.all([
      request("POST", path, {
        ...base,
        latitude: 0,
        longitude: 0,
        building: "بناء الاختبار",
        label: "البيت",
      }),
      request("POST", path, { ...base, street: "شارع ثان", label: "الشغل" }),
    ]);
    expect(responses.map(({ statusCode }) => statusCode)).toEqual([201, 201]);
    const saved = responses.map((response) =>
      customerAddressSchema.parse(response.json()),
    );
    const initialDefault = saved.find(({ isDefault }) => isDefault);
    const alternate = saved.find(({ isDefault }) => !isDefault);
    const withGps = saved.find(({ label }) => label === "البيت");
    if (!initialDefault || !alternate || !withGps)
      throw new Error(
        "Expected two addresses with one default and one coordinate pair.",
      );
    expect(withGps).toMatchObject({
      latitude: 0,
      longitude: 0,
      building: "بناء الاختبار",
    });
    const defaults = () =>
      test.db.customerAddress.count({
        where: { customerId: customer.id, isDefault: true },
      });
    expect(await defaults()).toBe(1);
    expect(
      (await request("PATCH", `${path}/${withGps.id}`, { longitude: 20 }))
        .statusCode,
    ).toBe(400);
    const cleared = await request("PATCH", `${path}/${withGps.id}`, {
      latitude: null,
      longitude: null,
      building: null,
    });
    expect(cleared.statusCode).toBe(200);
    expect(customerAddressSchema.parse(cleared.json())).toMatchObject({
      latitude: null,
      longitude: null,
      building: null,
    });

    const racingSelections = await Promise.all([
      request("PATCH", `${path}/${alternate.id}/default`),
      request("PATCH", `${path}/${initialDefault.id}/default`),
    ]);
    expect(racingSelections.map(({ statusCode }) => statusCode)).toEqual([
      200, 200,
    ]);
    expect(await defaults()).toBe(1);
    const chosen = await request("PATCH", `${path}/${alternate.id}/default`);
    expect(customerAddressSchema.parse(chosen.json()).isDefault).toBe(true);
    expect(
      customerAddressListSchema
        .parse((await request("GET", path)).json())
        .map(({ id }) => id),
    ).toEqual([alternate.id, initialDefault.id]);

    await test.db.governorate.update({
      where: { id: area.governorateId },
      data: { isActive: false },
    });
    expect((await request("POST", path, base)).statusCode).toBe(400);
    expect(
      (
        await request("PATCH", `${path}/${initialDefault.id}`, {
          neighborhoodId: area.neighborhoodId,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request("PATCH", `${path}/${initialDefault.id}`, {
          notes: "ملاحظة محفوظة",
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request("DELETE", `${path}/${alternate.id}`)).statusCode,
    ).toBe(204);
    expect((await request("GET", `${path}/${alternate.id}`)).statusCode).toBe(
      404,
    );
    const remaining = customerAddressListSchema.parse(
      (await request("GET", path)).json(),
    );
    expect(remaining.map(({ id, isDefault }) => ({ id, isDefault }))).toEqual([
      { id: initialDefault.id, isDefault: true },
    ]);
    expect(
      (await request("DELETE", `${path}/${initialDefault.id}`)).statusCode,
    ).toBe(204);
    expect(
      customerAddressListSchema.parse((await request("GET", path)).json()),
    ).toEqual([]);
  } finally {
    await test.api.close();
  }
}, 30_000);
