import { randomUUID } from "node:crypto";
import { expect, inject, it, vi } from "vitest";
import { runOrderSweep, startOrderJobs } from "../src/orders/jobs.js";
import type { PushProvider } from "../src/orders/push.js";
import { transitionOrder } from "../src/orders/transition.js";
import { openAuthTest } from "./auth-test-support.js";

async function setup(index: number) {
  const test = openAuthTest();
  const { db, clock } = test;
  const customer = await db.customer.create({
    data: { name: "Test customer" },
  });
  const restaurant = await db.restaurant.create({
    data: { status: "APPROVED", name: "Fixture", commissionRateBps: 1_000 },
  });
  const branch = await db.branch.create({
    data: { restaurantId: restaurant.id },
  });
  const user = await db.restaurantUser.create({
    data: {
      restaurantId: restaurant.id,
      role: "OWNER",
      phone: `+96390071000${index}`,
      passwordHash: "fixture-unused",
    },
  });
  const order = (ageSeconds: number) =>
    db.order.create({
      data: {
        customerId: customer.id,
        branchId: branch.id,
        orderNumber: `JOB-${randomUUID()}`,
        idempotencyKey: randomUUID(),
        type: "DELIVERY",
        customerName: "Test customer",
        foodSubtotalMinor: 1_000n,
        deliveryFeeMinor: 250n,
        totalMinor: 1_250n,
        commissionMinor: 100n,
        commissionRateBps: 1_000,
        etaMinutes: 25,
        createdAt: new Date(clock.now.getTime() - ageSeconds * 1_000),
      },
    });
  const pushed: string[] = [];
  const reminders: string[] = [];
  const push: PushProvider = {
    async newOrder() {},
    async orderStatusChanged(_customerId, orderId, status) {
      pushed.push(`${orderId}:${status}`);
    },
    async orderReminder(_restaurantId, orderId) {
      reminders.push(orderId);
    },
  };
  return {
    ...test,
    order,
    user,
    restaurant,
    pushed,
    reminders,
    sweep: { db, now: () => clock.now, push, logger: test.api.log },
  };
}

it("marks attention, repeats reminders once per minute, and expires without accepting", async () => {
  const test = await setup(1);
  const { db, order, clock, reminders, pushed, api, sweep } = test;
  try {
    const latest = await order(45);
    const attention = await order(180);
    const stale = await order(480);
    await runOrderSweep(sweep);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: latest.id } })).status,
    ).toBe("PENDING");
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: attention.id } }))
        .needsAttention,
    ).toBe(true);
    expect(reminders.filter((id) => id === attention.id)).toHaveLength(1);
    expect(
      await db.order.findUniqueOrThrow({ where: { id: stale.id } }),
    ).toMatchObject({
      status: "EXPIRED",
      commissionMinor: 0n,
      needsAttention: false,
    });
    expect(
      await db.orderStatusEvent.count({
        where: { orderId: stale.id, to: "EXPIRED", actorType: "SYSTEM" },
      }),
    ).toBe(1);
    expect(
      pushed.filter((entry) => entry === `${stale.id}:EXPIRED`),
    ).toHaveLength(1);
    expect(await db.ledgerEntry.count({ where: { orderId: stale.id } })).toBe(
      0,
    );

    await runOrderSweep(sweep);
    expect(reminders.filter((id) => id === attention.id)).toHaveLength(1);
    clock.now = new Date(clock.now.getTime() + 60_000);
    await Promise.all([runOrderSweep(sweep), runOrderSweep(sweep)]);
    expect(reminders.filter((id) => id === attention.id)).toHaveLength(2);
    expect(
      await db.orderStatusEvent.count({ where: { orderId: stale.id } }),
    ).toBe(1);
  } finally {
    await api.close();
  }
}, 30_000);

it("races restaurant acceptance against expiration without out-of-order side effects", async () => {
  const { api, db, clock, order, user, restaurant, sweep, pushed } =
    await setup(2);
  try {
    const stale = await order(480);
    const [sweepResult, accept] = await Promise.allSettled([
      runOrderSweep(sweep),
      transitionOrder(db, {
        id: stale.id,
        to: "ACCEPTED",
        actor: {
          type: "RESTAURANT",
          id: user.id,
          role: "OWNER",
          restaurantId: restaurant.id,
        },
        now: clock.now,
        prepMinutes: 20,
      }),
    ]);
    expect(sweepResult.status).toBe("fulfilled");
    const stored = await db.order.findUniqueOrThrow({
      where: { id: stale.id },
    });
    const events = await db.orderStatusEvent.findMany({
      where: { orderId: stale.id },
    });
    expect(events.map(({ from, to }) => ({ from, to }))).toEqual([
      { from: "PENDING", to: stored.status },
    ]);
    if (stored.status === "ACCEPTED") {
      expect(accept.status).toBe("fulfilled");
      expect(stored.prepMinutes).toBe(20);
      expect(stored.estimatedDeliveryAt).toEqual(
        new Date(clock.now.getTime() + 45 * 60_000),
      );
      expect(pushed).not.toContain(`${stale.id}:EXPIRED`);
    } else {
      expect(stored.status).toBe("EXPIRED");
      expect(accept.status).toBe("rejected");
      if (accept.status === "rejected")
        expect(accept.reason).toMatchObject({ statusCode: 409 });
      expect(stored.estimatedDeliveryAt).toBeNull();
    }
    expect(await db.ledgerEntry.count({ where: { orderId: stale.id } })).toBe(
      0,
    );
  } finally {
    await api.close();
  }
}, 30_000);

it("runs the maintenance job through pg-boss in the isolated PostgreSQL schema", async () => {
  const { url, schema } = inject("testDatabase");
  const { order, api, sweep, pushed } = await setup(3);
  let stop: (() => Promise<void>) | undefined;
  try {
    const expired = await order(500);
    stop = await startOrderJobs({
      ...sweep,
      databaseUrl: url,
      schema,
      createSchema: false,
    });
    await vi.waitFor(() => expect(pushed).toContain(`${expired.id}:EXPIRED`), {
      timeout: 20_000,
      interval: 250,
    });
    const next = await order(500);
    await vi.waitFor(() => expect(pushed).toContain(`${next.id}:EXPIRED`), {
      timeout: 22_000,
      interval: 250,
    });
  } finally {
    try {
      await stop?.();
    } finally {
      await api.close();
    }
  }
}, 55_000);
