import {
  recordAdjustmentSchema,
  recordPaymentSchema,
  restaurantIdParamsSchema,
} from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import {
  requireAdminRole,
  requireRestaurant,
  requireRestaurantRole,
} from "../auth/access.js";
import { browseCurrencyMode } from "../browse/shared.js";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { minorNumber } from "../menu/shared.js";
import {
  appendAdminLedgerEntry,
  ledgerEntryFields,
  serializeLedgerEntry,
} from "./ledger.js";

const adminFinance = { preHandler: requireAdminRole("SUPER_ADMIN", "FINANCE") };
const restaurantFinance = { preHandler: requireRestaurantRole("OWNER") };

async function assertRestaurantExists(
  db: Prisma.TransactionClient,
  id: string,
) {
  const restaurant = await db.restaurant.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!restaurant) throw new ApiError(404, "NOT_FOUND");
}

async function readLedger(db: PrismaClient, restaurantId: string) {
  const [currencyDisplayMode, entries] = await Promise.all([
    browseCurrencyMode(db),
    db.ledgerEntry.findMany({
      where: { restaurantId },
      select: ledgerEntryFields,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);
  return {
    restaurantId,
    currencyDisplayMode,
    entries: entries.map(serializeLedgerEntry),
  };
}

interface RestaurantBalanceRow {
  restaurantId: string;
  name: string | null;
  balanceMinor: string;
}

export function registerFinanceLedgerRoutes(
  api: FastifyInstance,
  db: PrismaClient,
) {
  const adminRestaurants = "/admin/finance/restaurants";
  const adminRestaurant = `${adminRestaurants}/:restaurantId`;

  api.get(adminRestaurants, adminFinance, async () => {
    const [currencyDisplayMode, rows] = await Promise.all([
      browseCurrencyMode(db),
      db.$queryRaw<RestaurantBalanceRow[]>`
        SELECT restaurant."id" AS "restaurantId", restaurant."name",
          COALESCE(SUM(entry."amountMinor"), 0)::text AS "balanceMinor"
        FROM "Restaurant" AS restaurant
        LEFT JOIN "LedgerEntry" AS entry ON entry."restaurantId" = restaurant."id"
        GROUP BY restaurant."id"
        ORDER BY restaurant."name" ASC NULLS LAST, restaurant."id" ASC
      `,
    ]);
    return {
      currencyDisplayMode,
      restaurants: rows.map(({ balanceMinor, ...restaurant }) => ({
        ...restaurant,
        balanceMinor: minorNumber(BigInt(balanceMinor)),
      })),
    };
  });

  api.get(`${adminRestaurant}/ledger`, adminFinance, async (request) => {
    const { restaurantId } = restaurantIdParamsSchema.parse(request.params);
    await assertRestaurantExists(db, restaurantId);
    return readLedger(db, restaurantId);
  });

  api.post(
    `${adminRestaurant}/payments`,
    adminFinance,
    async (request, reply) => {
      const { restaurantId } = restaurantIdParamsSchema.parse(request.params);
      const { amountMinor, paymentDate, paymentMethod, reference } =
        recordPaymentSchema.parse(request.body);
      const entry = await db.$transaction(async (tx) => {
        await assertRestaurantExists(tx, restaurantId);
        return appendAdminLedgerEntry(tx, request, {
          restaurantId,
          type: "PAYMENT_RECEIVED",
          amountMinor: -BigInt(amountMinor),
          paymentDate: new Date(`${paymentDate}T00:00:00.000Z`),
          paymentMethod,
          reference,
        });
      });
      return reply.code(201).send(entry);
    },
  );

  api.post(
    `${adminRestaurant}/adjustments`,
    adminFinance,
    async (request, reply) => {
      const { restaurantId } = restaurantIdParamsSchema.parse(request.params);
      const { amountMinor, reason } = recordAdjustmentSchema.parse(
        request.body,
      );
      const entry = await db.$transaction(async (tx) => {
        await assertRestaurantExists(tx, restaurantId);
        return appendAdminLedgerEntry(tx, request, {
          restaurantId,
          type: "ADJUSTMENT",
          amountMinor: BigInt(amountMinor),
          reason,
        });
      });
      return reply.code(201).send(entry);
    },
  );

  api.get("/restaurant/finance/ledger", restaurantFinance, (request) => {
    const { restaurantId } = requireRestaurant(request);
    return readLedger(db, restaurantId);
  });
}
