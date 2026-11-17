import {
  adminSettingsPatchSchema,
  type AdminSettings,
} from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import { writeAdminAudit } from "../audit.js";
import { requireAdminRole } from "../auth/access.js";
import { readDefaultCommission } from "../auth/credential-routes.js";
import { browseCurrencyMode } from "../browse/shared.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { readOrderTimings } from "../orders/settings.js";

const settingsManagers = { preHandler: requireAdminRole("SUPER_ADMIN") };
const settingKeyByField = {
  reminderAfterSec: "order.reminderAfterSec",
  attentionAfterSec: "order.attentionAfterSec",
  expireAfterSec: "order.expireAfterSec",
  defaultCommissionRateBps: "commission.defaultRateBps",
  currencyDisplayMode: "currency.displayMode",
} satisfies Record<keyof AdminSettings, string>;
const editableFields = Object.keys(
  settingKeyByField,
) as (keyof AdminSettings)[];

async function readSettings(
  db: Prisma.TransactionClient,
): Promise<AdminSettings> {
  const [timings, defaultCommissionRateBps, currencyDisplayMode] =
    await Promise.all([
      readOrderTimings(db),
      readDefaultCommission(db),
      browseCurrencyMode(db),
    ]);
  return { ...timings, defaultCommissionRateBps, currencyDisplayMode };
}

export function registerAdminSettingsRoutes(
  api: FastifyInstance,
  db: PrismaClient,
) {
  api.get("/admin/settings", settingsManagers, async (_request, reply) => {
    const settings = await db.$transaction(readSettings, {
      isolationLevel: "RepeatableRead",
    });
    return reply.header("Cache-Control", "no-store").send(settings);
  });

  api.patch("/admin/settings", settingsManagers, async (request, reply) => {
    const changes = adminSettingsPatchSchema.parse(request.body);
    const settings = await db.$transaction(async (tx) => {
      // Lock all setting writes so each audit records the value it actually replaced.
      await tx.$executeRaw`LOCK TABLE "PlatformSetting" IN SHARE ROW EXCLUSIVE MODE`;
      const before = await readSettings(tx);
      for (const field of editableFields) {
        const value = changes[field];
        if (value === undefined || value === before[field]) continue;
        const key = settingKeyByField[field];
        await tx.platformSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        });
        await writeAdminAudit(tx, request, {
          action: "PLATFORM_SETTING_UPDATE",
          entityType: "PlatformSetting",
          entityId: key,
          before: { value: before[field] },
          after: { value },
        });
      }
      return { ...before, ...changes };
    });
    return reply.header("Cache-Control", "no-store").send(settings);
  });
}
