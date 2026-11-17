import {
  publicRestaurantDetailParamsSchema,
  publicRestaurantDetailQuerySchema,
  type PublicRestaurantDetailResponse,
} from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { minorNumber } from "../menu/shared.js";
import {
  browseAvailability,
  browseCurrencyMode,
  isItemAvailableAt,
} from "./shared.js";

const menuOrder = [{ sortOrder: "asc" as const }, { id: "asc" as const }];
const live = { deletedAt: null } as const;
const menuChoiceFields = {
  id: true,
  name: true,
  sortOrder: true,
  priceMinor: true,
} as const;

const sectionFields = {
  id: true,
  name: true,
  sortOrder: true,
  items: {
    where: live,
    orderBy: menuOrder,
    select: {
      id: true,
      name: true,
      description: true,
      imageKey: true,
      isAvailable: true,
      sortOrder: true,
      availableFrom: true,
      availableTo: true,
      sizes: { where: live, orderBy: menuOrder, select: menuChoiceFields },
      optionGroups: {
        where: live,
        orderBy: menuOrder,
        select: {
          id: true,
          name: true,
          minSelect: true,
          maxSelect: true,
          sortOrder: true,
          options: {
            where: live,
            orderBy: menuOrder,
            select: { ...menuChoiceFields, isAvailable: true },
          },
        },
      },
    },
  },
} satisfies Prisma.MenuSectionSelect;

type MenuSection = Prisma.MenuSectionGetPayload<{
  select: typeof sectionFields;
}>;

function serializeMenuSection(section: MenuSection, instant: Date) {
  return {
    ...section,
    items: section.items.map((item) => ({
      ...item,
      isAvailable: item.sizes.length > 0 && isItemAvailableAt(item, instant),
      sizes: item.sizes.map((size) => ({
        ...size,
        priceMinor: minorNumber(size.priceMinor),
      })),
      optionGroups: item.optionGroups.map((group) => ({
        ...group,
        options: group.options.map((option) => ({
          ...option,
          priceMinor: minorNumber(option.priceMinor),
        })),
      })),
    })),
  };
}

export function registerBrowseDetailRoutes(
  api: FastifyInstance,
  { db, now }: { db: PrismaClient; now: () => Date },
): void {
  api.get(
    "/public/restaurants/:id",
    async (request): Promise<PublicRestaurantDetailResponse> => {
      const { id } = publicRestaurantDetailParamsSchema.parse(request.params);
      const { neighborhoodId } = publicRestaurantDetailQuerySchema.parse(
        request.query,
      );
      const deliveryZone = {
        neighborhoodId,
        neighborhood: {
          isActive: true,
          city: { isActive: true, governorate: { isActive: true } },
        },
      } satisfies Prisma.DeliveryZoneWhereInput;
      const restaurant = await db.restaurant.findFirst({
        where: {
          id,
          status: "APPROVED",
          branch: { deliveryZones: { some: deliveryZone } },
        },
        select: {
          id: true,
          name: true,
          logoKey: true,
          coverImageKey: true,
          contactPhone: true,
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
            where: live,
            orderBy: menuOrder,
            select: sectionFields,
          },
          branch: {
            select: {
              id: true,
              acceptingOrders: true,
              lastSeenAt: true,
              minOrderMinor: true,
              pickupEnabled: true,
              openingPeriods: {
                select: { dayOfWeek: true, opensAt: true, closesAt: true },
              },
              deliveryZones: {
                where: deliveryZone,
                select: { feeMinor: true, etaMinutes: true },
              },
            },
          },
        },
      });

      const branch = restaurant?.branch;
      const zone = branch?.deliveryZones[0];
      if (!restaurant || !branch || !zone) throw new ApiError(404, "NOT_FOUND");

      const instant = now();
      const sections = restaurant.menuSections.map((section) =>
        serializeMenuSection(section, instant),
      );
      const hasAvailableItem = sections.some(({ items }) =>
        items.some(({ isAvailable }) => isAvailable),
      );
      return {
        id: restaurant.id,
        branchId: branch.id,
        name: restaurant.name,
        logoKey: restaurant.logoKey,
        coverImageKey: restaurant.coverImageKey,
        contactPhone: restaurant.contactPhone,
        categories: restaurant.categories.map(({ category }) => category),
        ...browseAvailability(branch, hasAvailableItem, instant),
        deliveryFeeMinor: minorNumber(zone.feeMinor),
        minOrderMinor: minorNumber(branch.minOrderMinor),
        etaMinutes: zone.etaMinutes,
        pickupEnabled: branch.pickupEnabled,
        currencyDisplayMode: await browseCurrencyMode(db),
        sections,
      };
    },
  );
}
