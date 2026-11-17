import type { FastifyBaseLogger } from "fastify";
import { PgBoss } from "pg-boss";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { notifyPush, type PushProvider } from "./push.js";
import { readOrderTimings } from "./settings.js";
import { transitionOrder } from "./transition.js";

const queueName = "order-maintenance";
const intervalSeconds = 15;
const repeatReminderSeconds = 60;
const batchSize = 100;

interface OrderSweepOptions {
  db: PrismaClient;
  now: () => Date;
  push: PushProvider;
  logger: FastifyBaseLogger;
}

export async function runOrderSweep({
  db,
  now,
  push,
  logger,
}: OrderSweepOptions) {
  const instant = now();
  const timing = await readOrderTimings(db);
  const since = (seconds: number) =>
    new Date(instant.getTime() - seconds * 1_000);
  const expiredBefore = since(timing.expireAfterSec);
  const expired = await db.order.findMany({
    where: { status: "PENDING", createdAt: { lte: expiredBefore } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: batchSize,
    select: { id: true },
  });

  for (const { id } of expired) {
    try {
      const result = await transitionOrder(db, {
        id,
        actor: { type: "SYSTEM" },
        to: "EXPIRED",
        now: instant,
        expiresAtOrBefore: expiredBefore,
      });
      if (result.changed) {
        await notifyPush(logger, () =>
          push.orderStatusChanged(result.customerId, id, "EXPIRED"),
        );
      }
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        (error.statusCode !== 409 && error.statusCode !== 404)
      )
        throw error;
    }
  }

  await db.order.updateMany({
    where: {
      status: "PENDING",
      needsAttention: false,
      createdAt: { lte: since(timing.attentionAfterSec), gt: expiredBefore },
    },
    data: { needsAttention: true },
  });

  const reminderBefore = since(timing.reminderAfterSec);
  const dueForReminder = {
    status: "PENDING",
    createdAt: { lte: reminderBefore, gt: expiredBefore },
    OR: [
      { lastReminderAt: null },
      { lastReminderAt: { lte: since(repeatReminderSeconds) } },
    ],
  } satisfies Prisma.OrderWhereInput;
  const reminders = await db.order.findMany({
    where: dueForReminder,
    orderBy: [
      { lastReminderAt: { sort: "asc", nulls: "first" } },
      { createdAt: "asc" },
      { id: "asc" },
    ],
    take: batchSize,
    select: { id: true, branch: { select: { restaurantId: true } } },
  });
  for (const { id, branch } of reminders) {
    const claimed = await db.order.updateMany({
      where: { id, ...dueForReminder },
      data: { lastReminderAt: instant },
    });
    if (claimed.count)
      await notifyPush(logger, () =>
        push.orderReminder(branch.restaurantId, id),
      );
  }
}

interface OrderJobsOptions extends OrderSweepOptions {
  databaseUrl: string;
  schema: string;
  createSchema?: boolean;
}

export async function startOrderJobs({
  databaseUrl,
  schema,
  createSchema = true,
  ...sweep
}: OrderJobsOptions) {
  const boss = new PgBoss({
    connectionString: databaseUrl,
    schema,
    createSchema,
    schedule: false,
    connectionTimeoutMillis: 10_000,
  });
  boss.on("error", () => sweep.logger.error("Order queue connection failed."));
  let publishing: Promise<unknown> | undefined;
  function enqueue() {
    if (!publishing) {
      publishing = boss
        .sendThrottled(queueName, null, null, intervalSeconds, queueName)
        .catch(() => sweep.logger.error("Could not enqueue order maintenance."))
        .finally(() => {
          publishing = undefined;
        });
    }
  }

  try {
    await boss.start();
    await boss.createQueue(queueName, {
      policy: "exclusive",
      retryLimit: 2,
      retryDelay: 5,
    });
    await boss.work<unknown, void>(
      queueName,
      { pollingIntervalSeconds: 1 },
      () => runOrderSweep(sweep),
    );
  } catch {
    await boss.stop().catch(() => undefined);
    throw new Error("Could not start the order maintenance queue.");
  }

  enqueue();
  // Cron in pg-boss has minute resolution; each interval submits a database-throttled job.
  const timer = setInterval(enqueue, intervalSeconds * 1_000).unref();
  return async () => {
    clearInterval(timer);
    await publishing;
    await boss.stop();
  };
}
