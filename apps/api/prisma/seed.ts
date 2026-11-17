import { argon2Sync, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

interface SeedOptions {
  databaseUrl: string;
  schema?: string;
  adminPassword?: string;
  adminTotpSecret?: string;
}

const adminEmail = "admin@be-fast.example";
const initialCommissionBps = 1_000;
const queryTimeoutMs = 10_000;

function fixtureId(sequence: number): string {
  return `bf000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
}

const neighborhoods = Array.from({ length: 8 }, (_, index) => ({
  id: fixtureId(10 + index),
  cityId: fixtureId(2),
  name: `الحي التجريبي ${index + 1}`,
}));

const categories = [
  "شاورما",
  "بيتزا",
  "بروستد",
  "مشاوي",
  "برغر",
  "حلويات",
  "مشروبات",
].map((name, sortOrder) => ({
  id: fixtureId(20 + sortOrder),
  name,
  sortOrder,
}));

const restaurants = [
  {
    name: "شاورما الساحة التجريبي",
    categories: [0, 6],
    menuItems: ["ساندويش شاورما", "وجبة شاورما"],
  },
  {
    name: "بيتزا الفرن التجريبي",
    categories: [1, 5],
    menuItems: ["بيتزا الخضار", "بيتزا الجبنة"],
  },
  {
    name: "دار المشاوي التجريبي",
    categories: [2, 3, 4],
    menuItems: ["وجبة مشاوي", "برغر مشوي"],
  },
  {
    name: "مطبخ الحي التجريبي",
    categories: [2],
    menuItems: [],
  },
].map((restaurant, index) => ({
  ...restaurant,
  id: fixtureId(100 + index),
  branchId: fixtureId(200 + index),
  phone: `+96390000001${index}`,
  status: restaurant.menuItems.length
    ? ("APPROVED" as const)
    : ("PENDING_REVIEW" as const),
}));

const approvedRestaurants = restaurants.filter(
  ({ status }) => status === "APPROVED",
);
const menuItems = approvedRestaurants.flatMap(
  ({ menuItems }, restaurantIndex) =>
    menuItems.map((name, sortOrder) => ({
      id: fixtureId(500 + restaurantIndex * 10 + sortOrder),
      sectionId: fixtureId(400 + restaurantIndex),
      name,
      sortOrder,
    })),
);

function hashPassword(password: string | Uint8Array): string {
  const memory = 65_536;
  const passes = 3;
  const parallelism = 1;
  const nonce = randomBytes(16);
  const hash = argon2Sync("argon2id", {
    message: password,
    nonce,
    memory,
    passes,
    parallelism,
    tagLength: 32,
  });
  const salt = nonce.toString("base64").replace(/=+$/u, "");
  const digest = hash.toString("base64").replace(/=+$/u, "");
  return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${salt}$${digest}`;
}

function randomTotpSecret(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  return Array.from(randomBytes(32), (byte) => alphabet.charAt(byte & 31)).join(
    "",
  );
}

function checkAdminCredentials({
  adminPassword,
  adminTotpSecret,
}: SeedOptions): void {
  if (adminPassword === undefined && adminTotpSecret === undefined) return;
  if (
    adminPassword === undefined ||
    adminPassword.length < 8 ||
    adminTotpSecret === undefined ||
    !/^[A-Z2-7]{16,}$/u.test(adminTotpSecret)
  ) {
    throw new Error(
      "Set both SEED_ADMIN_PASSWORD (at least 8 characters) and SEED_ADMIN_TOTP_SECRET (uppercase Base32, at least 16 characters).",
    );
  }
}

export async function seedDevelopmentDatabase(
  options: SeedOptions,
): Promise<void> {
  checkAdminCredentials(options);
  try {
    const schema =
      options.schema ??
      new URL(options.databaseUrl).searchParams.get("schema") ??
      "public";
    const adapter = new PrismaPg(
      {
        connectionString: options.databaseUrl,
        connectionTimeoutMillis: queryTimeoutMs,
        query_timeout: queryTimeoutMs,
      },
      { schema },
    );
    const prisma = new PrismaClient({ adapter });
    try {
      await prisma.$transaction([
        prisma.governorate.createMany({
          skipDuplicates: true,
          data: [{ id: fixtureId(1), name: "المحافظة التجريبية" }],
        }),
        prisma.city.createMany({
          skipDuplicates: true,
          data: [
            {
              id: fixtureId(2),
              governorateId: fixtureId(1),
              name: "المدينة التجريبية",
            },
          ],
        }),
        prisma.neighborhood.createMany({
          skipDuplicates: true,
          data: neighborhoods,
        }),
        prisma.foodCategory.createMany({
          skipDuplicates: true,
          data: categories,
        }),
        prisma.restaurant.createMany({
          skipDuplicates: true,
          data: restaurants.map(({ id, name, status, phone }) => ({
            id,
            name,
            status,
            contactPhone: phone,
            commissionRateBps: initialCommissionBps,
          })),
        }),
        prisma.restaurantCategory.createMany({
          skipDuplicates: true,
          data: restaurants.flatMap((restaurant) =>
            restaurant.categories.map((category) => ({
              restaurantId: restaurant.id,
              categoryId: fixtureId(20 + category),
            })),
          ),
        }),
        prisma.branch.createMany({
          skipDuplicates: true,
          data: restaurants.map(({ id, branchId }, index) => ({
            id: branchId,
            restaurantId: id,
            neighborhoodId: fixtureId(10 + index),
            address: `الشارع التجريبي ${index + 1}`,
            minOrderMinor: 20_000n,
            pickupEnabled: true,
          })),
        }),
        prisma.openingPeriod.createMany({
          skipDuplicates: true,
          data: restaurants.flatMap(({ branchId }, restaurantIndex) =>
            Array.from({ length: 7 }, (_, dayOfWeek) => ({
              id: fixtureId(1_000 + restaurantIndex * 10 + dayOfWeek),
              branchId,
              dayOfWeek,
              opensAt: "11:00",
              closesAt: "23:30",
            })),
          ),
        }),
        prisma.deliveryZone.createMany({
          skipDuplicates: true,
          data: restaurants.flatMap(({ branchId }, index) => [
            {
              branchId,
              neighborhoodId: fixtureId(10 + 2 * index),
              feeMinor: 5_000n,
              etaMinutes: 30,
            },
            {
              branchId,
              neighborhoodId: fixtureId(11 + 2 * index),
              feeMinor: 10_000n,
              etaMinutes: 45,
            },
          ]),
        }),
        prisma.restaurantUser.createMany({
          skipDuplicates: true,
          data: restaurants.map(({ id }, index) => ({
            id: fixtureId(300 + index),
            restaurantId: id,
            phone: `+96390000002${index}`,
            role: "OWNER",
            passwordHash: hashPassword(randomBytes(32)),
          })),
        }),
        prisma.menuSection.createMany({
          skipDuplicates: true,
          data: approvedRestaurants.map(({ id }, index) => ({
            id: fixtureId(400 + index),
            restaurantId: id,
            name: "الوجبات",
          })),
        }),
        prisma.menuItem.createMany({
          skipDuplicates: true,
          data: menuItems.map(({ id, sectionId, name, sortOrder }) => ({
            id,
            sectionId,
            name,
            sortOrder,
          })),
        }),
        prisma.itemSize.createMany({
          skipDuplicates: true,
          data: menuItems.flatMap(({ id }, index) => [
            {
              id: fixtureId(600 + index * 2),
              menuItemId: id,
              name: "عادي",
              priceMinor: 30_000n,
            },
            {
              id: fixtureId(601 + index * 2),
              menuItemId: id,
              name: "كبير",
              priceMinor: 45_000n,
              sortOrder: 1,
            },
          ]),
        }),
        prisma.optionGroup.createMany({
          skipDuplicates: true,
          data: menuItems.flatMap(({ id }, index) => [
            {
              id: fixtureId(700 + index * 2),
              menuItemId: id,
              name: "نوع الخبز",
              minSelect: 1,
              maxSelect: 1,
            },
            {
              id: fixtureId(701 + index * 2),
              menuItemId: id,
              name: "إضافات",
              minSelect: 0,
              maxSelect: 2,
              sortOrder: 1,
            },
          ]),
        }),
        prisma.option.createMany({
          skipDuplicates: true,
          data: menuItems.flatMap((_item, index) => [
            {
              id: fixtureId(800 + index * 4),
              optionGroupId: fixtureId(700 + index * 2),
              name: "خبز عادي",
              priceMinor: 0n,
            },
            {
              id: fixtureId(801 + index * 4),
              optionGroupId: fixtureId(700 + index * 2),
              name: "خبز محمّص",
              priceMinor: 0n,
              sortOrder: 1,
            },
            {
              id: fixtureId(802 + index * 4),
              optionGroupId: fixtureId(701 + index * 2),
              name: "بدون بصل",
              priceMinor: 0n,
            },
            {
              id: fixtureId(803 + index * 4),
              optionGroupId: fixtureId(701 + index * 2),
              name: "صوص إضافي",
              priceMinor: 2_000n,
              sortOrder: 1,
            },
          ]),
        }),
        prisma.customer.createMany({
          skipDuplicates: true,
          data: [
            { id: fixtureId(900), name: "عميل تجريبي", phone: "+963900000001" },
          ],
        }),
        prisma.adminUser.createMany({
          skipDuplicates: true,
          data: [
            {
              id: fixtureId(901),
              email: adminEmail,
              role: "SUPER_ADMIN",
              passwordHash: hashPassword(
                options.adminPassword ?? randomBytes(32),
              ),
              totpSecret: options.adminTotpSecret ?? randomTotpSecret(),
            },
          ],
        }),
        prisma.platformSetting.createMany({
          skipDuplicates: true,
          data: [
            { key: "currency.displayMode", value: "OLD" },
            { key: "commission.defaultRateBps", value: initialCommissionBps },
            { key: "order.reminderAfterSec", value: 60 },
            { key: "order.attentionAfterSec", value: 180 },
            { key: "order.expireAfterSec", value: 480 },
            { key: "order.maxActivePerCustomer", value: 2 },
            { key: "privacy.restaurantOrderDetailsHours", value: 24 },
            { key: "finance.statementCycle", value: "WEEKLY" },
          ],
        }),
      ]);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    throw new Error("Could not insert the PostgreSQL development fixtures.");
  }
}

if (import.meta.main) {
  try {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "The development seed cannot run with NODE_ENV=production.",
      );
    }
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl)
      throw new Error("DATABASE_URL is required for the development seed.");
    const devEndpoint = URL.parse(databaseUrl)?.hostname.toLowerCase();
    const testEndpoint = URL.parse(
      process.env.TEST_DATABASE_URL ?? "",
    )?.hostname.toLowerCase();
    if (devEndpoint && devEndpoint === testEndpoint) {
      throw new Error(
        "DATABASE_URL must use a different endpoint from TEST_DATABASE_URL.",
      );
    }
    await seedDevelopmentDatabase({
      databaseUrl,
      adminPassword: process.env.SEED_ADMIN_PASSWORD,
      adminTotpSecret: process.env.SEED_ADMIN_TOTP_SECRET,
    });
    console.log("PostgreSQL development fixtures are ready.");
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "The development seed failed.",
    );
    process.exitCode = 1;
  }
}
