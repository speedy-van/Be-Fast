import { messages } from "@be-fast/i18n";
import { expect, it } from "vitest";
import type { RestaurantRole } from "../src/generated/prisma/enums.ts";
import { openAuthTest } from "./auth-test-support.js";

const roles = ["OWNER", "MANAGER", "CASHIER", "KITCHEN"] as const;

async function menuFixture(
  context: ReturnType<typeof openAuthTest>,
  role: RestaurantRole,
  index: number,
) {
  const { db, tokens } = context;
  const restaurant = await db.restaurant.create({
    data: { status: "APPROVED", commissionRateBps: 1_000 },
  });
  const branch = await db.branch.create({
    data: { restaurantId: restaurant.id },
  });
  const user = await db.restaurantUser.create({
    data: {
      restaurantId: restaurant.id,
      role,
      phone: `+96390055100${index}`,
      passwordHash: "fixture-unused",
    },
  });
  const section = await db.menuSection.create({
    data: { name: "Fixture section", restaurantId: restaurant.id },
  });
  const item = await db.menuItem.create({
    data: {
      name: "Fixture item",
      description: "Fixture description",
      sortOrder: 4,
      availableFrom: "08:00",
      availableTo: "12:00",
      sectionId: section.id,
    },
  });
  const size = await db.itemSize.create({
    data: {
      name: messages.menu.regularSize,
      priceMinor: 1_200n,
      menuItemId: item.id,
    },
  });
  const group = await db.optionGroup.create({
    data: {
      name: "Fixture group",
      minSelect: 0,
      maxSelect: 1,
      menuItemId: item.id,
    },
  });
  const option = await db.option.create({
    data: { name: "Fixture option", priceMinor: 200n, optionGroupId: group.id },
  });
  const session = await tokens.issue({
    aud: "restaurant",
    sub: user.id,
    restaurantId: restaurant.id,
    role,
  });
  return {
    restaurant,
    branch,
    section,
    item,
    size,
    group,
    option,
    headers: { authorization: `Bearer ${session.accessToken}` },
  };
}

it.each(roles)(
  "enforces the menu and settings permission matrix for %s",
  async (role) => {
    const context = openAuthTest();
    const { api, db } = context;
    try {
      const { headers, section, item, size, group, option, branch } =
        await menuFixture(context, role, roles.indexOf(role));
      const editsMenu = role === "OWNER" || role === "MANAGER";
      const pausesBranch = role !== "KITCHEN";
      const itemPath = `/restaurant/menu/items/${item.id}`;
      const optionPath = `/restaurant/menu/options/${option.id}`;
      const sectionPath = `/restaurant/menu/sections/${section.id}`;

      const availabilityRoutes = [itemPath, optionPath];
      for (const route of availabilityRoutes) {
        for (const isAvailable of [false, true]) {
          const response = await api.inject({
            method: "PATCH",
            url: `${route}/availability`,
            headers,
            payload: { isAvailable },
          });
          expect(response.statusCode).toBe(200);
          expect(response.json().isAvailable).toBe(isAvailable);
        }
      }
      expect(
        (await db.menuItem.findUniqueOrThrow({ where: { id: item.id } }))
          .isAvailable,
      ).toBe(true);
      expect(
        (await db.option.findUniqueOrThrow({ where: { id: option.id } }))
          .isAvailable,
      ).toBe(true);

      for (const [url, payload] of [
        [sectionPath, { name: "Renamed section", sortOrder: 5 }],
        [itemPath, { name: "Renamed item" }],
        [itemPath, { sortOrder: 6 }],
        [`/restaurant/menu/sizes/${size.id}`, { priceMinor: 1_400 }],
        [
          `/restaurant/menu/option-groups/${group.id}`,
          { name: "Renamed group" },
        ],
        [optionPath, { name: "Renamed option", priceMinor: 300, sortOrder: 7 }],
        [
          "/restaurant/branch/settings",
          { pickupEnabled: true, minOrderMinor: 500 },
        ],
      ] as const) {
        const response = await api.inject({
          method: "PATCH",
          url,
          headers,
          payload,
        });
        expect(response.statusCode, url).toBe(editsMenu ? 200 : 403);
      }

      for (const [url, payload] of [
        [
          "/restaurant/branch/opening-periods",
          { periods: [{ dayOfWeek: 2, opensAt: "08:00", closesAt: "20:00" }] },
        ],
        ["/restaurant/branch/delivery-zones", { zones: [] }],
      ] as const) {
        const response = await api.inject({
          method: "PUT",
          url,
          headers,
          payload,
        });
        expect(response.statusCode, url).toBe(editsMenu ? 200 : 403);
      }

      for (const acceptingOrders of [true, false]) {
        const response = await api.inject({
          method: "PATCH",
          url: "/restaurant/branch/accepting-orders",
          headers,
          payload: { acceptingOrders },
        });
        expect(response.statusCode).toBe(pausesBranch ? 200 : 403);
        expect(
          (await db.branch.findUniqueOrThrow({ where: { id: branch.id } }))
            .acceptingOrders,
        ).toBe(pausesBranch && acceptingOrders);
      }

      const copy = await api.inject({
        method: "POST",
        url: `${itemPath}/duplicate`,
        headers,
      });
      expect(copy.statusCode).toBe(editsMenu ? 201 : 403);
      const deletion = await api.inject({
        method: "DELETE",
        url: itemPath,
        headers,
      });
      expect(deletion.statusCode).toBe(editsMenu ? 204 : 403);
      const stored = await db.menuItem.findUniqueOrThrow({
        where: { id: item.id },
      });
      expect(stored.deletedAt !== null).toBe(editsMenu);
      expect(stored.name).toBe(editsMenu ? "Renamed item" : item.name);
      expect(stored.sortOrder).toBe(editsMenu ? 6 : item.sortOrder);
    } finally {
      await api.close();
    }
  },
  35_000,
);

it("duplicates the active sizes, option groups and options as independent unavailable data", async () => {
  const context = openAuthTest();
  const { api, db } = context;
  try {
    const { headers, item, size, group, option } = await menuFixture(
      context,
      "OWNER",
      4,
    );
    const extraSize = await db.itemSize.create({
      data: {
        menuItemId: item.id,
        name: "Large",
        priceMinor: 1_700n,
        sortOrder: 2,
      },
    });
    const extraOption = await db.option.create({
      data: {
        optionGroupId: group.id,
        name: "Extra",
        priceMinor: 150n,
        sortOrder: 3,
        isAvailable: false,
      },
    });
    await db.option.create({
      data: {
        optionGroupId: group.id,
        name: "Removed",
        priceMinor: 100n,
        deletedAt: context.clock.now,
      },
    });

    const response = await api.inject({
      method: "POST",
      url: `/restaurant/menu/items/${item.id}/duplicate`,
      headers,
    });
    expect(response.statusCode).toBe(201);
    const itemId = response.json().id as string;
    const duplicate = await db.menuItem.findUniqueOrThrow({
      where: { id: itemId },
      include: {
        sizes: { orderBy: { sortOrder: "asc" } },
        optionGroups: {
          include: { options: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    expect(duplicate.id).not.toBe(item.id);
    expect(duplicate).toMatchObject({
      name: item.name + messages.menu.copySuffix,
      isAvailable: false,
      description: item.description,
      sortOrder: 4,
      availableFrom: "08:00",
      availableTo: "12:00",
    });
    expect(
      duplicate.sizes.map(({ name, priceMinor, sortOrder }) => ({
        name,
        priceMinor,
        sortOrder,
      })),
    ).toEqual([
      { name: size.name, priceMinor: 1_200n, sortOrder: 0 },
      { name: extraSize.name, priceMinor: 1_700n, sortOrder: 2 },
    ]);
    expect(
      duplicate.sizes.some((entry) =>
        [size.id, extraSize.id].includes(entry.id),
      ),
    ).toBe(false);
    expect(duplicate.optionGroups).toHaveLength(1);
    const [copyGroup] = duplicate.optionGroups;
    if (!copyGroup) throw new Error("Missing copied group.");
    expect(copyGroup.id).not.toBe(group.id);
    expect(copyGroup).toMatchObject({
      name: group.name,
      minSelect: 0,
      maxSelect: 1,
    });
    expect(
      copyGroup.options.map(({ name, priceMinor, sortOrder, isAvailable }) => ({
        name,
        priceMinor,
        sortOrder,
        isAvailable,
      })),
    ).toEqual([
      { name: option.name, priceMinor: 200n, sortOrder: 0, isAvailable: true },
      {
        name: extraOption.name,
        priceMinor: 150n,
        sortOrder: 3,
        isAvailable: false,
      },
    ]);
    expect(
      copyGroup.options.some((entry) =>
        [option.id, extraOption.id].includes(entry.id),
      ),
    ).toBe(false);
    const [copyOption] = copyGroup.options;
    if (!copyOption) throw new Error("Missing copied option.");
    const updated = await api.inject({
      method: "PATCH",
      url: `/restaurant/menu/options/${copyOption.id}/availability`,
      headers,
      payload: { isAvailable: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(
      (await db.option.findUniqueOrThrow({ where: { id: option.id } }))
        .isAvailable,
    ).toBe(true);
  } finally {
    await api.close();
  }
}, 30_000);
