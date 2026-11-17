import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { expect, inject, it } from "vitest";
import { runMigrations } from "../prisma/migrate.ts";
import { seedDevelopmentDatabase } from "../prisma/seed.ts";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const databaseTimeoutMs = 10_000;

function readRestaurants(prisma: PrismaClient) {
  return prisma.restaurant.findMany({
    orderBy: { id: "asc" },
    select: {
      status: true,
      commissionRateBps: true,
      branch: {
        select: {
          _count: { select: { openingPeriods: true, deliveryZones: true } },
        },
      },
      categories: {
        select: { categoryId: true },
        orderBy: { categoryId: "asc" },
      },
      users: { select: { role: true } },
      menuSections: {
        select: {
          items: {
            orderBy: { sortOrder: "asc" },
            select: {
              sizes: {
                select: { priceMinor: true },
                orderBy: { sortOrder: "asc" },
              },
              optionGroups: {
                orderBy: { sortOrder: "asc" },
                select: {
                  minSelect: true,
                  maxSelect: true,
                  _count: { select: { options: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

it(
  "migrates an empty schema and seeds it twice without altering existing fixtures",
  async () => {
    const testUrl = new URL(inject("testDatabase").url);
    const schema = `test_${randomUUID().replaceAll("-", "")}`;
    const pgOptions = {
      connectionTimeoutMillis: databaseTimeoutMs,
      query_timeout: databaseTimeoutMs,
    };
    const admin = new Client({ connectionString: testUrl.href, ...pgOptions });
    await admin.connect();

    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      runMigrations(testUrl.href, schema);
      testUrl.searchParams.set("options", `-c search_path=${schema}`);
      const databaseUrl = testUrl.href;
      const adapter = new PrismaPg(
        { connectionString: databaseUrl, ...pgOptions },
        { schema },
      );
      const prisma = new PrismaClient({ adapter });

      try {
        expect(await prisma.restaurant.count()).toBe(0);
        expect(await prisma.adminUser.count()).toBe(0);

        await seedDevelopmentDatabase({ databaseUrl, schema });

        const readGeography = () =>
          prisma.governorate.findMany({
            select: {
              name: true,
              cities: {
                select: {
                  name: true,
                  neighborhoods: {
                    select: { name: true },
                    orderBy: { id: "asc" },
                  },
                },
              },
            },
          });
        const geography = [
          {
            name: "المحافظة التجريبية",
            cities: [
              {
                name: "المدينة التجريبية",
                neighborhoods: Array.from({ length: 8 }, (_, index) => ({
                  name: `الحي التجريبي ${index + 1}`,
                })),
              },
            ],
          },
        ];
        expect(await readGeography()).toEqual(geography);
        const readCategories = () =>
          prisma.foodCategory.findMany({
            orderBy: { sortOrder: "asc" },
            select: { name: true },
          });
        const categories = [
          "شاورما",
          "بيتزا",
          "بروستد",
          "مشاوي",
          "برغر",
          "حلويات",
          "مشروبات",
        ].map((name) => ({ name }));
        expect(await readCategories()).toEqual(categories);

        const restaurants = await readRestaurants(prisma);
        expect(restaurants.map(({ status }) => status)).toEqual([
          "APPROVED",
          "APPROVED",
          "APPROVED",
          "PENDING_REVIEW",
        ]);
        for (const restaurant of restaurants) {
          expect(restaurant.commissionRateBps).toBe(1_000);
          expect(restaurant.branch?._count).toEqual({
            openingPeriods: 7,
            deliveryZones: 2,
          });
          expect(restaurant.categories.length).toBeGreaterThan(0);
          expect(restaurant.users).toEqual([{ role: "OWNER" }]);
          const items = restaurant.menuSections.flatMap(({ items }) => items);
          if (restaurant.status === "PENDING_REVIEW") {
            expect(items).toHaveLength(0);
            continue;
          }
          expect(items).toHaveLength(2);
          for (const item of items) {
            expect(item.sizes).toEqual([
              { priceMinor: 30_000n },
              { priceMinor: 45_000n },
            ]);
            expect(item.optionGroups).toEqual([
              { minSelect: 1, maxSelect: 1, _count: { options: 2 } },
              { minSelect: 0, maxSelect: 2, _count: { options: 2 } },
            ]);
          }
        }

        const readAdmins = () =>
          prisma.adminUser.findMany({
            select: { role: true, passwordHash: true, totpSecret: true },
          });
        const admins = await readAdmins();
        expect(admins.map(({ role }) => role)).toEqual(["SUPER_ADMIN"]);
        const initialAdmin = admins[0];
        expect(initialAdmin?.passwordHash.startsWith("$argon2id$v=19$")).toBe(
          true,
        );
        expect(/^[A-Z2-7]{32}$/u.test(initialAdmin?.totpSecret ?? "")).toBe(
          true,
        );
        expect(await prisma.customer.count()).toBe(1);

        async function readSettings() {
          const settings = await prisma.platformSetting.findMany({
            select: { key: true, value: true },
          });
          return Object.fromEntries(
            settings.map(({ key, value }) => [key, value]),
          );
        }
        const settings = {
          "commission.defaultRateBps": 1_000,
          "currency.displayMode": "OLD",
          "finance.statementCycle": "WEEKLY",
          "order.attentionAfterSec": 180,
          "order.expireAfterSec": 480,
          "order.maxActivePerCustomer": 2,
          "order.reminderAfterSec": 60,
          "privacy.restaurantOrderDetailsHours": 24,
        };
        expect(await readSettings()).toEqual(settings);

        await prisma.platformSetting.update({
          where: { key: "currency.displayMode" },
          data: { value: "NEW" },
        });
        await seedDevelopmentDatabase({ databaseUrl, schema });

        expect(await readGeography()).toEqual(geography);
        expect(await readCategories()).toEqual(categories);
        expect(await readRestaurants(prisma)).toEqual(restaurants);
        expect(await prisma.customer.count()).toBe(1);
        expect(await readSettings()).toEqual({
          ...settings,
          "currency.displayMode": "NEW",
        });
        const rerunAdmins = await readAdmins();
        expect(rerunAdmins).toHaveLength(1);
        expect(
          rerunAdmins[0]?.passwordHash === initialAdmin?.passwordHash,
        ).toBe(true);
        expect(rerunAdmins[0]?.totpSecret === initialAdmin?.totpSecret).toBe(
          true,
        );
      } finally {
        await prisma.$disconnect();
      }
    } finally {
      try {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await admin.end();
      }
    }
  },
  // A fresh schema migration and independent fixture writes are part of this test.
  60_000,
);
