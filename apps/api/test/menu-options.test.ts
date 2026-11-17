import { describe, expect, it } from "vitest";
import { openAuthTest } from "./auth-test-support.js";

const integrationTimeoutMs = 30_000;

interface OptionResult {
  id: string;
  name: string;
  priceMinor: number;
  isAvailable: boolean;
}

interface GroupResult {
  id: string;
  minSelect: number;
  maxSelect: number;
  options: OptionResult[];
}

type MenuTest = ReturnType<typeof openAuthTest>;

async function withMenuTest(run: (test: MenuTest) => Promise<void>) {
  const test = openAuthTest();
  try {
    await run(test);
  } finally {
    await test.api.close();
  }
}

async function createMenuOwner({ db, tokens }: MenuTest, phone: string) {
  const restaurant = await db.restaurant.create({
    data: {
      name: "Fixture",
      status: "APPROVED",
      commissionRateBps: 1000,
      branch: { create: {} },
    },
  });
  const owner = await db.restaurantUser.create({
    data: {
      restaurantId: restaurant.id,
      phone,
      passwordHash: "fixture",
      role: "OWNER",
    },
  });
  const item = await db.menuItem.create({
    data: {
      section: { create: { restaurantId: restaurant.id, name: "Menu" } },
      name: "Item",
      sizes: { create: { name: "Regular", priceMinor: 5000n } },
    },
  });
  const { accessToken } = await tokens.issue({
    aud: "restaurant",
    sub: owner.id,
    restaurantId: restaurant.id,
    role: "OWNER",
  });
  return { owner, item, headers: { authorization: `Bearer ${accessToken}` } };
}

const optionRows = [
  { name: "First option", priceMinor: 100, sortOrder: 1 },
  { name: "Second option", priceMinor: 200, sortOrder: 2, isAvailable: false },
  { name: "Third option", priceMinor: 300, sortOrder: 3 },
];

function createGroup(
  { api }: MenuTest,
  { item, headers }: Awaited<ReturnType<typeof createMenuOwner>>,
  minSelect: number,
  maxSelect: number,
  options = optionRows.slice(0, 2),
) {
  return api.inject({
    method: "POST",
    url: `/restaurant/menu/items/${item.id}/option-groups`,
    headers,
    payload: { name: "Adjustments", minSelect, maxSelect, options },
  });
}

describe("menu option groups and options", () => {
  it(
    "rejects group bounds beyond its options on creation and updates",
    () =>
      withMenuTest(async (test) => {
        const owner = await createMenuOwner(test, "+963955700001");
        const invalid = await createGroup(test, owner, 3, 3);
        expect(invalid.statusCode).toBe(400);
        expect(invalid.json().error.code).toBe("VALIDATION_ERROR");
        expect(
          await test.db.optionGroup.count({
            where: { menuItemId: owner.item.id },
          }),
        ).toBe(0);

        const valid = await createGroup(test, owner, 1, 2);
        expect(valid.statusCode).toBe(201);
        const { id, options } = valid.json<GroupResult>();
        expect(
          options.map(({ name, isAvailable }) => ({ name, isAvailable })),
        ).toEqual([
          { name: "First option", isAvailable: true },
          { name: "Second option", isAvailable: false },
        ]);
        const { headers } = owner;
        const url = `/restaurant/menu/option-groups/${id}`;
        const patchInvalid = await test.api.inject({
          method: "PATCH",
          url,
          headers,
          payload: { maxSelect: 3 },
        });
        expect(patchInvalid.statusCode).toBe(400);
        expect(
          (
            await test.api.inject({ method: "GET", url, headers })
          ).json<GroupResult>().maxSelect,
        ).toBe(2);
      }),
    integrationTimeoutMs,
  );

  it(
    "preserves group bounds when deletions race and archives the deleted option",
    () =>
      withMenuTest(async (test) => {
        const owner = await createMenuOwner(test, "+963955700002");
        const created = await createGroup(test, owner, 1, 2, optionRows);
        expect(created.statusCode).toBe(201);
        const { id, options } = created.json<GroupResult>();
        const targets = options.slice(0, 2);
        const { headers } = owner;
        const results = await Promise.all(
          targets.map(({ id }) =>
            test.api.inject({
              method: "DELETE",
              url: `/restaurant/menu/options/${id}`,
              headers,
            }),
          ),
        );
        expect(results.map(({ statusCode }) => statusCode).sort()).toEqual([
          204, 400,
        ]);

        const deleted =
          targets[results.findIndex(({ statusCode }) => statusCode === 204)];
        if (!deleted) throw new Error("One option should have been archived.");
        const archived = await test.db.option.findUniqueOrThrow({
          where: { id: deleted.id },
        });
        expect(archived.deletedAt).toBeInstanceOf(Date);
        const fetchArchived = await test.api.inject({
          method: "GET",
          url: `/restaurant/menu/options/${deleted.id}`,
          headers,
        });
        expect(fetchArchived.statusCode).toBe(404);
        const list = await test.api.inject({
          method: "GET",
          url: `/restaurant/menu/option-groups/${id}/options`,
          headers,
        });
        expect(list.json<{ options: OptionResult[] }>().options).toHaveLength(
          2,
        );
      }),
    integrationTimeoutMs,
  );

  it(
    "logs each actual price change once and attributes it to the acting user",
    () =>
      withMenuTest(async (test) => {
        const owner = await createMenuOwner(test, "+963955700003");
        const group = await createGroup(test, owner, 0, 0, []);
        expect(group.statusCode).toBe(201);
        const { id } = group.json<GroupResult>();
        const { headers } = owner;
        const option = await test.api.inject({
          method: "POST",
          url: `/restaurant/menu/option-groups/${id}/options`,
          headers,
          payload: { name: "Extra", priceMinor: 525 },
        });
        expect(option.statusCode).toBe(201);
        const { id: optionId } = option.json<OptionResult>();
        const url = `/restaurant/menu/options/${optionId}`;
        const patch = await test.api.inject({
          method: "PATCH",
          url,
          headers,
          payload: { priceMinor: 600 },
        });
        expect(patch.statusCode).toBe(200);
        expect(patch.json<OptionResult>().priceMinor).toBe(600);
        const noPriceChange = await test.api.inject({
          method: "PATCH",
          url,
          headers,
          payload: { name: "Extra updated", priceMinor: 600 },
        });
        expect(noPriceChange.statusCode).toBe(200);

        expect(
          await test.db.priceChangeLog.findMany({ where: { optionId } }),
        ).toMatchObject([
          {
            optionId,
            itemSizeId: null,
            restaurantUserId: owner.owner.id,
            oldPriceMinor: 525n,
            newPriceMinor: 600n,
            createdAt: expect.any(Date),
          },
        ]);
      }),
    integrationTimeoutMs,
  );

  it(
    "returns 404 when another restaurant owns the parent item, group or option",
    () =>
      withMenuTest(async (test) => {
        const first = await createMenuOwner(test, "+963955700004");
        const second = await createMenuOwner(test, "+963955700005");
        const created = await createGroup(test, second, 1, 2);
        expect(created.statusCode).toBe(201);
        const { id, options } = created.json<GroupResult>();
        const optionId = options[0]?.id;
        if (!optionId) throw new Error("Expected a seeded option.");
        const itemUrl = `/restaurant/menu/items/${second.item.id}/option-groups`;
        const groupUrl = `/restaurant/menu/option-groups/${id}`;
        const optionUrl = `/restaurant/menu/options/${optionId}`;
        const { headers } = first;

        for (const url of [
          itemUrl,
          groupUrl,
          `${groupUrl}/options`,
          optionUrl,
        ]) {
          const response = await test.api.inject({
            method: "GET",
            url,
            headers,
          });
          expect(response.statusCode).toBe(404);
        }
        expect(
          (await createGroup(test, { ...second, headers }, 1, 2)).statusCode,
        ).toBe(404);
        expect(
          (
            await test.api.inject({
              method: "POST",
              url: `${groupUrl}/options`,
              headers,
              payload: { name: "Extra", priceMinor: 100 },
            })
          ).statusCode,
        ).toBe(404);
        for (const url of [groupUrl, optionUrl]) {
          expect(
            (
              await test.api.inject({
                method: "PATCH",
                url,
                headers,
                payload: { name: "No" },
              })
            ).statusCode,
          ).toBe(404);
          expect(
            (await test.api.inject({ method: "DELETE", url, headers }))
              .statusCode,
          ).toBe(404);
        }
      }),
    integrationTimeoutMs,
  );

  it(
    "archives an option group together with its live option rows",
    () =>
      withMenuTest(async (test) => {
        const owner = await createMenuOwner(test, "+963955700006");
        const created = await createGroup(test, owner, 1, 2);
        expect(created.statusCode).toBe(201);
        const { id, options } = created.json<GroupResult>();
        const { headers } = owner;
        const url = `/restaurant/menu/option-groups/${id}`;
        expect(
          (await test.api.inject({ method: "DELETE", url, headers }))
            .statusCode,
        ).toBe(204);
        expect(
          (await test.api.inject({ method: "GET", url, headers })).statusCode,
        ).toBe(404);
        const rows = await test.db.option.findMany({
          where: { optionGroupId: id },
        });
        expect(rows.map((row) => row.id).sort()).toEqual(
          options.map((row) => row.id).sort(),
        );
        expect(rows.every(({ deletedAt }) => deletedAt instanceof Date)).toBe(
          true,
        );
      }),
    integrationTimeoutMs,
  );
});
