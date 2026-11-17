import { randomBytes, randomUUID } from "node:crypto";
import { generateSecret } from "otplib";
import type {
  AdminE2eFixtures,
  AdminE2eStartup,
} from "../../../e2e/protocol.ts";
import type { PrismaClient } from "../src/generated/prisma/client.ts";
import { openTestDatabase } from "./test-database.ts";

type PasswordHasher = typeof import("../src/auth/credentials.js").hashPassword;

async function seedAdminJourneys(
  db: PrismaClient,
  hashPassword: PasswordHasher,
): Promise<AdminE2eFixtures> {
  const accounts = {
    superAdmin: {
      email: "dashboard-admin@example.test",
      password: randomUUID(),
      totpSecret: generateSecret(),
    },
    support: {
      email: "dashboard-support@example.test",
      password: randomUUID(),
      totpSecret: generateSecret(),
    },
    supportApi: {
      email: "dashboard-support-api@example.test",
      password: randomUUID(),
      totpSecret: generateSecret(),
    },
  };
  await db.adminUser.createMany({
    data: await Promise.all(
      Object.entries(accounts).map(
        async ([account, { email, password, totpSecret }]) =>
          ({
            email,
            totpSecret,
            passwordHash: await hashPassword(password),
            role: account === "superAdmin" ? "SUPER_ADMIN" : "SUPPORT",
          }) as const,
      ),
    ),
  });

  const governorate = await db.governorate.create({
    data: {
      name: "محافظة اختبار لوحة الإدارة",
      cities: {
        create: {
          name: "مدينة الاختبار",
          neighborhoods: { create: { name: "حي الاختبار" } },
        },
      },
    },
    select: { cities: { select: { neighborhoods: { select: { id: true } } } } },
  });
  const neighborhood = governorate.cities[0]?.neighborhoods[0];
  if (!neighborhood)
    throw new Error("The dashboard fixture neighborhood is missing.");
  const restaurantName = "مطعم الاختبار الشامل";
  const now = new Date();
  const restaurant = await db.restaurant.create({
    data: {
      name: restaurantName,
      contactPhone: "+963900000891",
      commissionRateBps: 1000,
      status: "PENDING_REVIEW",
      categories: {
        create: { category: { create: { name: "وجبات الاختبار" } } },
      },
      documents: {
        create: {
          type: "LICENSE",
          storageKey: `fixtures/${randomUUID()}.webp`,
        },
      },
      branch: {
        create: {
          neighborhoodId: neighborhood.id,
          address: "شارع الاختبار",
          pickupEnabled: true,
          openingPeriods: {
            create: { dayOfWeek: 0, opensAt: "08:00", closesAt: "23:00" },
          },
          deliveryZones: {
            create: {
              neighborhoodId: neighborhood.id,
              feeMinor: 5000n,
              etaMinutes: 30,
            },
          },
        },
      },
    },
    select: { id: true },
  });
  const financeRestaurantName = "مطعم كشف الحساب";
  const financeRestaurant = await db.restaurant.create({
    data: {
      name: financeRestaurantName,
      contactPhone: "+963900000893",
      status: "APPROVED",
      commissionRateBps: 1000,
      branch: { create: { pickupEnabled: true, address: "شارع الاختبار" } },
    },
    select: { id: true, branch: { select: { id: true } } },
  });
  if (!financeRestaurant.branch)
    throw new Error("The dashboard fixture branch is missing.");
  const customer = await db.customer.create({
    data: { phone: "+963900000892", name: "عميل الاختبار" },
  });
  const menuItem = await db.menuItem.create({
    data: {
      name: "وجبة الاختبار",
      section: {
        create: { name: "الوجبات", restaurantId: financeRestaurant.id },
      },
      sizes: { create: { name: "عادي", priceMinor: 80_000n } },
    },
    select: {
      id: true,
      name: true,
      sizes: { select: { id: true, name: true } },
    },
  });
  const size = menuItem.sizes[0];
  if (!size) throw new Error("The dashboard fixture item size is missing.");
  const orderData = {
    customerId: customer.id,
    customerName: "عميل الاختبار",
    branchId: financeRestaurant.branch.id,
    type: "PICKUP",
    foodSubtotalMinor: 80_000n,
    deliveryFeeMinor: 0n,
    totalMinor: 80_000n,
    commissionRateBps: 1000,
    commissionMinor: 8000n,
    prepMinutes: 15,
    acceptedAt: now,
    items: {
      create: {
        menuItemId: menuItem.id,
        sizeId: size.id,
        name: menuItem.name,
        sizeName: size.name,
        unitPriceMinor: 80_000n,
        totalMinor: 80_000n,
        quantity: 1,
      },
    },
  } as const;
  const order = await db.order.create({
    data: {
      ...orderData,
      orderNumber: "BF-970001",
      idempotencyKey: randomUUID(),
      status: "ACCEPTED",
      statusEvents: {
        create: { from: "PENDING", to: "ACCEPTED", actorType: "RESTAURANT" },
      },
    },
    select: { id: true, orderNumber: true },
  });
  await db.order.create({
    data: {
      ...orderData,
      orderNumber: "BF-970002",
      idempotencyKey: randomUUID(),
      status: "DELIVERED",
      finishedAt: now,
      ledgerEntries: {
        create: {
          restaurantId: financeRestaurant.id,
          type: "COMMISSION_ACCRUED",
          amountMinor: 8000n,
        },
      },
    },
  });

  return {
    accounts,
    restaurant: {
      id: restaurant.id,
      name: restaurantName,
      neighborhoodId: neighborhood.id,
    },
    financeRestaurantName,
    order,
  };
}

async function serveAdminJourneys() {
  const port = Number(process.env.BE_FAST_ADMIN_E2E_PORT);
  if (!process.send || !Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("The admin test API must be started by Playwright.");
  }
  const disconnected = new Promise<void>((resolve) =>
    process.once("disconnect", resolve),
  );
  const report = (message: AdminE2eStartup) => {
    if (process.connected) process.send?.(message);
  };
  let phase: Extract<AdminE2eStartup, { status: "failed" }>["phase"] =
    "database";
  try {
    const scope = await openTestDatabase();
    try {
      phase = "fixtures";
      const modules = await Promise.all([
        import(new URL("../dist/app.js", import.meta.url).href) as Promise<
          typeof import("../src/app.js")
        >,
        import(
          new URL("../dist/auth/credentials.js", import.meta.url).href
        ) as Promise<typeof import("../src/auth/credentials.js")>,
      ]);
      const [{ createApi, createDatabaseClient }, { hashPassword }] = modules;
      const db = createDatabaseClient(scope.url, scope.schema);
      let fixtures: AdminE2eFixtures;
      try {
        fixtures = await seedAdminJourneys(db, hashPassword);
      } finally {
        await db.$disconnect();
      }

      phase = "http";
      const api = createApi(scope.url, {
        databaseSchema: scope.schema,
        auth: { secret: randomBytes(32) },
      });
      try {
        await api.listen({ host: "127.0.0.1", port });
        report({ status: "ready", fixtures });
        await disconnected;
      } finally {
        await api.close();
      }
    } finally {
      await scope.close();
    }
  } catch {
    report({ status: "failed", phase });
    process.exitCode = 1;
    if (process.connected) process.disconnect?.();
  }
}

await serveAdminJourneys();
