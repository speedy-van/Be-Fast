import { randomInt } from "node:crypto";
import { messages } from "@be-fast/i18n";
import type { InjectOptions } from "fastify";
import { describe, expect, it } from "vitest";
import { openAuthTest } from "./auth-test-support.js";

type Test = ReturnType<typeof openAuthTest>;
interface CatalogSize {
  id: string;
  name: string;
  priceMinor: number;
  sortOrder: number;
}
interface CatalogItem {
  id: string;
  name: string;
  sizes: CatalogSize[];
}
const integrationTimeout = 30_000;
const menu = "/restaurant/menu";

function send(
  test: Test,
  accessToken: string,
  method: InjectOptions["method"],
  url: string,
  payload?: InjectOptions["payload"],
) {
  return test.api.inject({
    method,
    url,
    payload,
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

async function owner(test: Test) {
  const account = await test.db.restaurantUser.create({
    data: {
      phone: `+9639${String(randomInt(100_000_000)).padStart(8, "0")}`,
      passwordHash: "fixture",
      role: "OWNER",
      restaurant: { create: { commissionRateBps: 1_000 } },
    },
  });
  const { accessToken } = await test.tokens.issue({
    aud: "restaurant",
    sub: account.id,
    role: "OWNER",
    restaurantId: account.restaurantId,
  });
  return { id: account.id, restaurantId: account.restaurantId, accessToken };
}

async function createSection(
  test: Test,
  accessToken: string,
  name: string,
  sortOrder = 0,
) {
  const response = await send(test, accessToken, "POST", `${menu}/sections`, {
    name,
    sortOrder,
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<{ id: string }>().id;
}

async function createItem(
  test: Test,
  accessToken: string,
  sectionId: string,
  priceMinor = 2000,
) {
  const response = await send(test, accessToken, "POST", `${menu}/items`, {
    sectionId,
    name: "Catalog item",
    sizes: [{ priceMinor }],
    availableFrom: "18:00",
    availableTo: "02:00",
  });
  expect(response.statusCode, response.body).toBe(201);
  const item = response.json<CatalogItem>();
  const [size] = item.sizes;
  if (!size) throw new Error("Catalog item did not contain its initial size.");
  return { itemId: item.id, size };
}

describe("restaurant menu catalog", () => {
  it(
    "rejects an item without a size and preserves one normal size during concurrent deletes",
    async () => {
      const test = openAuthTest();
      try {
        const { accessToken } = await owner(test);
        const sectionId = await createSection(test, accessToken, "Section");
        for (const sizes of [undefined, []]) {
          const rejected = await send(
            test,
            accessToken,
            "POST",
            `${menu}/items`,
            { sectionId, name: "No size", sizes },
          );
          expect(rejected.statusCode).toBe(400);
          expect(rejected.json()).toMatchObject({
            error: { code: "VALIDATION_ERROR" },
          });
        }
        expect(await test.db.menuItem.count({ where: { sectionId } })).toBe(0);

        const { itemId, size } = await createItem(test, accessToken, sectionId);
        expect(size).toMatchObject({
          name: messages.menu.regularSize,
          priceMinor: 2_000,
        });
        expect(
          (await send(test, accessToken, "DELETE", `${menu}/sizes/${size.id}`))
            .statusCode,
        ).toBe(409);

        const created = await send(
          test,
          accessToken,
          "POST",
          `${menu}/items/${itemId}/sizes`,
          {
            name: "Large fixture",
            priceMinor: 2_500,
            sortOrder: 1,
          },
        );
        expect(created.statusCode, created.body).toBe(201);
        const large = created.json<CatalogSize>();
        expect(large).toMatchObject({
          name: "Large fixture",
          priceMinor: 2_500,
        });
        const deletions = await Promise.all(
          [size.id, large.id].map((id) =>
            send(test, accessToken, "DELETE", `${menu}/sizes/${id}`),
          ),
        );
        expect(deletions.map(({ statusCode }) => statusCode).sort()).toEqual([
          204, 409,
        ]);
        const visible = await send(
          test,
          accessToken,
          "GET",
          `${menu}/items/${itemId}/sizes`,
        );
        expect(visible.json()).toEqual({
          sizes: [expect.objectContaining({ name: messages.menu.regularSize })],
        });
        expect(
          await test.db.itemSize.count({
            where: { menuItemId: itemId, deletedAt: { not: null } },
          }),
        ).toBe(1);
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "records exactly one original, changed, and actor value for an actual size price change",
    async () => {
      const test = openAuthTest();
      try {
        const { id, accessToken } = await owner(test);
        const sectionId = await createSection(test, accessToken, "Section");
        const { size } = await createItem(test, accessToken, sectionId, 20_000);
        const endpoint = `${menu}/sizes/${size.id}`;
        const changed = await send(test, accessToken, "PATCH", endpoint, {
          priceMinor: 22_550,
          sortOrder: 2,
        });
        expect(changed.statusCode, changed.body).toBe(200);
        expect(changed.json()).toMatchObject({
          id: size.id,
          priceMinor: 22_550,
          sortOrder: 2,
        });
        expect(
          (
            await send(test, accessToken, "PATCH", endpoint, {
              priceMinor: 22_550,
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (await send(test, accessToken, "PATCH", endpoint, { sortOrder: 1 }))
            .statusCode,
        ).toBe(200);
        expect(
          (
            await send(test, accessToken, "PATCH", endpoint, {
              priceMinor: 10.25,
            })
          ).statusCode,
        ).toBe(400);

        expect(
          await test.db.priceChangeLog.findMany({
            where: { itemSizeId: size.id },
          }),
        ).toEqual([
          expect.objectContaining({
            itemSizeId: size.id,
            optionId: null,
            oldPriceMinor: 20_000n,
            newPriceMinor: 22_550n,
            restaurantUserId: id,
            createdAt: expect.any(Date),
          }),
        ]);
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "sorts and moves restaurant sections and items and softly deletes entire subtrees",
    async () => {
      const test = openAuthTest();
      try {
        const { accessToken } = await owner(test);
        const firstSection = await createSection(test, accessToken, "First", 5);
        const secondSection = await createSection(
          test,
          accessToken,
          "Second",
          10,
        );
        const { itemId, size } = await createItem(
          test,
          accessToken,
          firstSection,
        );
        const group = await test.db.optionGroup.create({
          data: {
            menuItemId: itemId,
            name: "Group",
            minSelect: 0,
            maxSelect: 1,
          },
        });
        const option = await test.db.option.create({
          data: { optionGroupId: group.id, name: "Option", priceMinor: 50n },
        });
        const changedSection = await send(
          test,
          accessToken,
          "PATCH",
          `${menu}/sections/${secondSection}`,
          { sortOrder: 0 },
        );
        expect(changedSection.statusCode).toBe(200);
        const moved = await send(
          test,
          accessToken,
          "PATCH",
          `${menu}/items/${itemId}`,
          { sectionId: secondSection, name: "Moved", sortOrder: 2 },
        );
        expect(moved.statusCode, moved.body).toBe(200);
        const list = await send(test, accessToken, "GET", menu);
        expect(list.statusCode, list.body).toBe(200);
        expect(list.json()).toMatchObject({
          sections: [
            {
              id: secondSection,
              items: [
                {
                  id: itemId,
                  name: "Moved",
                  sortOrder: 2,
                  sizes: [{ id: size.id, priceMinor: 2000 }],
                  optionGroups: [
                    {
                      id: group.id,
                      options: [{ id: option.id, priceMinor: 50 }],
                    },
                  ],
                },
              ],
            },
            { id: firstSection, items: [] },
          ],
        });

        expect(
          (
            await send(
              test,
              accessToken,
              "DELETE",
              `${menu}/sections/${secondSection}`,
            )
          ).statusCode,
        ).toBe(204);
        const deletedSection = await test.db.menuSection.findUniqueOrThrow({
          where: { id: secondSection },
        });
        expect(deletedSection.deletedAt).toBeInstanceOf(Date);
        expect(
          await test.db.menuItem.findUniqueOrThrow({ where: { id: itemId } }),
        ).toMatchObject({ deletedAt: deletedSection.deletedAt });
        expect(
          await test.db.itemSize.findUniqueOrThrow({ where: { id: size.id } }),
        ).toMatchObject({ deletedAt: deletedSection.deletedAt });
        expect(
          await test.db.optionGroup.findUniqueOrThrow({
            where: { id: group.id },
          }),
        ).toMatchObject({ deletedAt: deletedSection.deletedAt });
        expect(
          await test.db.option.findUniqueOrThrow({ where: { id: option.id } }),
        ).toMatchObject({ deletedAt: deletedSection.deletedAt });
        for (const path of [
          `sections/${secondSection}`,
          `items/${itemId}`,
          `sizes/${size.id}`,
        ]) {
          expect(
            (await send(test, accessToken, "GET", `${menu}/${path}`))
              .statusCode,
          ).toBe(404);
        }
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );

  it(
    "does not allow another restaurant to access or move catalog resources",
    async () => {
      const test = openAuthTest();
      try {
        const first = await owner(test);
        const other = await owner(test);
        const ownSection = await createSection(
          test,
          first.accessToken,
          "First section",
        );
        const otherSection = await createSection(
          test,
          other.accessToken,
          "Other section",
        );
        const ownItem = await createItem(test, first.accessToken, ownSection);
        const otherItem = await createItem(
          test,
          other.accessToken,
          otherSection,
        );
        expect(
          (
            await send(
              test,
              first.accessToken,
              "PATCH",
              `${menu}/items/${ownItem.itemId}`,
              { sectionId: otherSection },
            )
          ).statusCode,
        ).toBe(404);
        for (const resource of [
          `sections/${otherSection}`,
          `items/${otherItem.itemId}`,
          `sizes/${otherItem.size.id}`,
        ]) {
          expect(
            (await send(test, first.accessToken, "GET", `${menu}/${resource}`))
              .statusCode,
          ).toBe(404);
          expect(
            (
              await send(
                test,
                first.accessToken,
                "PATCH",
                `${menu}/${resource}`,
                { name: "Unauthorized change" },
              )
            ).statusCode,
          ).toBe(404);
          expect(
            (
              await send(
                test,
                first.accessToken,
                "DELETE",
                `${menu}/${resource}`,
              )
            ).statusCode,
          ).toBe(404);
        }
      } finally {
        await test.api.close();
      }
    },
    integrationTimeout,
  );
});
