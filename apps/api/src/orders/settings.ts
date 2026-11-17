import type { Prisma } from "../generated/prisma/client.ts";

const defaultTimings = {
  "order.reminderAfterSec": 60,
  "order.attentionAfterSec": 180,
  "order.expireAfterSec": 480,
} as const;

export async function readOrderTimings(db: Prisma.TransactionClient) {
  const settings = await db.platformSetting.findMany({
    where: { key: { in: Object.keys(defaultTimings) } },
    select: { key: true, value: true },
  });
  const values = new Map(settings.map(({ key, value }) => [key, value]));
  const numberSetting = (key: keyof typeof defaultTimings) => {
    const value = values.get(key);
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? value
      : defaultTimings[key];
  };

  return {
    reminderAfterSec: numberSetting("order.reminderAfterSec"),
    attentionAfterSec: numberSetting("order.attentionAfterSec"),
    expireAfterSec: numberSetting("order.expireAfterSec"),
  };
}
