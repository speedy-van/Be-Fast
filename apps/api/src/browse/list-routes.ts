import { browseListQuerySchema, type BrowseListPage } from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "../generated/prisma/client.ts";
import { minorNumber } from "../menu/shared.js";
import {
  browseAvailability,
  browseCurrencyMode,
  isItemAvailableAt,
} from "./shared.js";

const pageSize = 20;
const arabicForms = "أإآةى";
const normalizedArabicForms = "اااهي";
const arabicMarks =
  "[\u0610-\u061a\u0640\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e8\u06ea-\u06ed\u08d3-\u08ff]";

// Apply the same normalization to the query and stored names in PostgreSQL.
function normalizedSearchText(value: Prisma.Sql): Prisma.Sql {
  const folded = Prisma.sql`lower(regexp_replace(translate(${value}, ${arabicForms}, ${normalizedArabicForms}), ${arabicMarks}, '', 'g'))`;
  // Both spellings of shawarma are searchable without treating other final letters as equivalent.
  return Prisma.sql`replace(${folded}, ${"شاورما"}, ${"شاورمه"})`;
}

async function findMatchingBranches(
  db: PrismaClient,
  neighborhoodId: string,
  query: string,
) {
  const matches = await db.$queryRaw<{ id: string }[]>`
    SELECT b."id"
    FROM "DeliveryZone" zone
    JOIN "Branch" b ON b."id" = zone."branchId"
    JOIN "Restaurant" r ON r."id" = b."restaurantId"
    CROSS JOIN (SELECT ${normalizedSearchText(Prisma.sql`${query}::text`)} AS value) normalized_query
    WHERE zone."neighborhoodId" = ${neighborhoodId}::uuid
      AND r."status" = 'APPROVED'
      AND (
        strpos(${normalizedSearchText(Prisma.sql`coalesce(r."name", '')`)}, normalized_query.value) > 0
        OR EXISTS (
          SELECT 1 FROM "MenuSection" section
          JOIN "MenuItem" item ON item."sectionId" = section."id"
          WHERE section."restaurantId" = r."id"
            AND section."deletedAt" IS NULL
            AND item."deletedAt" IS NULL
            AND strpos(${normalizedSearchText(Prisma.sql`item."name"`)}, normalized_query.value) > 0
        )
      )
  `;
  return matches.map(({ id }) => id);
}

const listZoneSelect = {
  feeMinor: true,
  etaMinutes: true,
  branch: {
    select: {
      id: true,
      minOrderMinor: true,
      acceptingOrders: true,
      lastSeenAt: true,
      openingPeriods: {
        select: { dayOfWeek: true, opensAt: true, closesAt: true },
      },
      restaurant: {
        select: {
          id: true,
          name: true,
          logoKey: true,
          categories: {
            where: { category: { isActive: true } },
            orderBy: [
              { category: { sortOrder: "asc" } },
              { categoryId: "asc" },
            ],
            select: {
              category: {
                select: { id: true, name: true, icon: true, sortOrder: true },
              },
            },
          },
          menuSections: {
            where: { deletedAt: null },
            select: {
              items: {
                where: {
                  deletedAt: null,
                  isAvailable: true,
                  sizes: { some: { deletedAt: null } },
                },
                select: {
                  isAvailable: true,
                  availableFrom: true,
                  availableTo: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.DeliveryZoneSelect;

type ListZone = Prisma.DeliveryZoneGetPayload<{
  select: typeof listZoneSelect;
}>;
type ListRestaurant = BrowseListPage["restaurants"][number];

function describeRestaurant(zone: ListZone, now: Date): ListRestaurant {
  const { branch } = zone;
  const { restaurant } = branch;
  const hasAvailableItem = restaurant.menuSections.some(({ items }) =>
    items.some((item) => isItemAvailableAt(item, now)),
  );

  return {
    id: restaurant.id,
    branchId: branch.id,
    name: restaurant.name,
    logoKey: restaurant.logoKey,
    categories: restaurant.categories.map(({ category }) => category),
    ...browseAvailability(branch, hasAvailableItem, now),
    deliveryFeeMinor: minorNumber(zone.feeMinor),
    minOrderMinor: minorNumber(branch.minOrderMinor),
    etaMinutes: zone.etaMinutes,
  };
}

function rankKey(
  restaurant: ListRestaurant,
): NonNullable<BrowseListPage["nextCursor"]> {
  return `${restaurant.isOrderable ? "0" : "1"}:${restaurant.id}`;
}

interface BrowseListOptions {
  db: PrismaClient;
  now: () => Date;
}

export function registerBrowseListRoutes(
  api: FastifyInstance,
  { db, now }: BrowseListOptions,
): void {
  api.get("/public/restaurants", async (request): Promise<BrowseListPage> => {
    const { neighborhoodId, categoryId, q, cursor } =
      browseListQuerySchema.parse(request.query);
    const currentTime = now();
    const matchingBranches = q
      ? await findMatchingBranches(db, neighborhoodId, q)
      : undefined;
    const zones = await db.deliveryZone.findMany({
      where: {
        neighborhoodId,
        neighborhood: {
          isActive: true,
          city: { isActive: true, governorate: { isActive: true } },
        },
        branch: {
          id:
            matchingBranches === undefined
              ? undefined
              : { in: matchingBranches },
          restaurant: {
            status: "APPROVED",
            categories:
              categoryId === undefined
                ? undefined
                : {
                    some: { categoryId, category: { isActive: true } },
                  },
          },
        },
      },
      select: listZoneSelect,
    });
    const ranked = zones
      .map((zone) => describeRestaurant(zone, currentTime))
      .map((restaurant) => ({ restaurant, key: rankKey(restaurant) }))
      .filter(({ key }) => cursor === undefined || key > cursor.toLowerCase())
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const page = ranked.slice(0, pageSize);

    return {
      restaurants: page.map(({ restaurant }) => restaurant),
      nextCursor: ranked.length > pageSize ? (page.at(-1)?.key ?? null) : null,
      currencyDisplayMode: await browseCurrencyMode(db),
    };
  });
}
