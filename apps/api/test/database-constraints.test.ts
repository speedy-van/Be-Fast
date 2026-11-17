import { randomUUID } from "node:crypto";
import { Client, DatabaseError } from "pg";
import { describe, expect, inject, it } from "vitest";

const databaseTestTimeoutMs = 20_000;

async function sql(
  client: Client,
  statement: string,
  values: (string | number)[] = [],
) {
  try {
    return await client.query(statement, values);
  } catch (error) {
    const databaseError = error instanceof DatabaseError ? error : undefined;
    throw Object.assign(
      new Error("PostgreSQL could not execute the test query."),
      {
        code: databaseError?.code,
        constraint: databaseError?.constraint,
      },
    );
  }
}

async function inTestTransaction(test: (client: Client) => Promise<void>) {
  const client = new Client({
    connectionString: inject("testDatabase").url,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  try {
    await client.connect();
  } catch {
    await client.end().catch(() => undefined);
    throw new Error("Could not connect to the PostgreSQL test schema.");
  }

  try {
    await sql(client, "BEGIN");
    try {
      await test(client);
    } finally {
      await sql(client, "ROLLBACK");
    }
  } finally {
    await client.end();
  }
}

async function insertRestaurant(client: Client) {
  const id = randomUUID();
  await sql(
    client,
    `INSERT INTO "Restaurant" ("id", "commissionRateBps") VALUES ($1, 1000)`,
    [id],
  );
  return id;
}

interface OrderFixture {
  orderId: string;
  restaurantId: string;
  branchId: string;
  customerId: string;
  idempotencyKey: string;
}

async function insertOrder(
  client: Client,
  order: Omit<OrderFixture, "restaurantId">,
  orderNumber: string,
) {
  await sql(
    client,
    `INSERT INTO "Order" (
       "id", "customerId", "branchId", "orderNumber", "idempotencyKey", "type",
       "customerName", "foodSubtotalMinor", "deliveryFeeMinor", "totalMinor",
       "commissionRateBps", "commissionMinor"
     ) VALUES ($1, $2, $3, $4, $5, 'PICKUP', 'Fixture', 1000, 0, 1000, 1000, 100)`,
    [
      order.orderId,
      order.customerId,
      order.branchId,
      orderNumber,
      order.idempotencyKey,
    ],
  );
}

async function createOrderFixture(client: Client): Promise<OrderFixture> {
  const fixture: OrderFixture = {
    orderId: randomUUID(),
    restaurantId: await insertRestaurant(client),
    branchId: randomUUID(),
    customerId: randomUUID(),
    idempotencyKey: randomUUID(),
  };
  await sql(client, `INSERT INTO "Customer" ("id") VALUES ($1)`, [
    fixture.customerId,
  ]);
  await sql(
    client,
    `INSERT INTO "Branch" ("id", "restaurantId") VALUES ($1, $2)`,
    [fixture.branchId, fixture.restaurantId],
  );
  await insertOrder(client, fixture, "BF-100001");
  return fixture;
}

async function insertLedgerEntry(
  client: Client,
  fixture: OrderFixture,
  type: "COMMISSION_ACCRUED" | "ADJUSTMENT",
) {
  const id = randomUUID();
  await sql(
    client,
    `INSERT INTO "LedgerEntry" ("id", "restaurantId", "orderId", "type", "amountMinor", "reason")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      fixture.restaurantId,
      fixture.orderId,
      type,
      type === "ADJUSTMENT" ? -100 : 100,
      "Fixture",
    ],
  );
  return id;
}

async function insertOrderStatusEvent(client: Client, fixture: OrderFixture) {
  const id = randomUUID();
  await sql(
    client,
    `INSERT INTO "OrderStatusEvent" ("id", "orderId", "to", "actorType", "actorId")
     VALUES ($1, $2, 'PENDING', 'CUSTOMER', $3)`,
    [id, fixture.orderId, fixture.customerId],
  );
  return id;
}

async function insertMenuItem(client: Client, restaurantId: string) {
  const sectionId = randomUUID();
  const itemId = randomUUID();
  await sql(
    client,
    `INSERT INTO "MenuSection" ("id", "restaurantId", "name") VALUES ($1, $2, 'Fixture')`,
    [sectionId, restaurantId],
  );
  await sql(
    client,
    `INSERT INTO "MenuItem" ("id", "sectionId", "name") VALUES ($1, $2, 'Fixture')`,
    [itemId, sectionId],
  );
  return itemId;
}

async function insertAuditLog(client: Client) {
  const adminId = randomUUID();
  const logId = randomUUID();
  const entityId = randomUUID();
  await sql(
    client,
    `INSERT INTO "AdminUser" ("id", "email", "passwordHash", "totpSecret", "role")
                     VALUES ($1, 'fixture@example.invalid', 'Fixture', 'Fixture', 'SUPER_ADMIN')`,
    [adminId],
  );
  await sql(
    client,
    `INSERT INTO "AuditLog" ("id", "adminUserId", "action", "entityType", "entityId", "ip")
                     VALUES ($1, $2, 'FIXTURE', 'Fixture', $3, '192.0.2.1')`,
    [logId, adminId, entityId],
  );
  return logId;
}

describe("PostgreSQL schema constraints", () => {
  it(
    "allows only one accrued commission per order and allows a separate adjustment",
    () =>
      inTestTransaction(async (client) => {
        const fixture = await createOrderFixture(client);
        await insertLedgerEntry(client, fixture, "COMMISSION_ACCRUED");
        await insertLedgerEntry(client, fixture, "ADJUSTMENT");
        await expect(
          insertLedgerEntry(client, fixture, "COMMISSION_ACCRUED"),
        ).rejects.toMatchObject({
          code: "23505",
          constraint: "LedgerEntry_orderId_commission_accrued_key",
        });
      }),
    databaseTestTimeoutMs,
  );

  it(
    "requires an order on an accrued commission",
    () =>
      inTestTransaction(async (client) => {
        const restaurantId = await insertRestaurant(client);
        await expect(
          sql(
            client,
            `INSERT INTO "LedgerEntry" ("restaurantId", "type", "amountMinor")
             VALUES ($1, 'COMMISSION_ACCRUED', 100)`,
            [restaurantId],
          ),
        ).rejects.toMatchObject({
          code: "23514",
          constraint: "LedgerEntry_commission_order_check",
        });
      }),
    databaseTestTimeoutMs,
  );

  it.each([
    ["update", `UPDATE "LedgerEntry" SET "amountMinor" = 200 WHERE "id" = $1`],
    ["delete", `DELETE FROM "LedgerEntry" WHERE "id" = $1`],
  ])(
    "denies %s of a ledger entry",
    (_operation, statement) =>
      inTestTransaction(async (client) => {
        const fixture = await createOrderFixture(client);
        const id = await insertLedgerEntry(
          client,
          fixture,
          "COMMISSION_ACCRUED",
        );
        await expect(sql(client, statement, [id])).rejects.toMatchObject({
          code: "55000",
        });
      }),
    databaseTestTimeoutMs,
  );

  it.each([
    [
      "update",
      `UPDATE "OrderStatusEvent" SET "note" = 'Edited' WHERE "id" = $1`,
    ],
    ["delete", `DELETE FROM "OrderStatusEvent" WHERE "id" = $1`],
  ])(
    "denies %s of an order status event",
    (_operation, statement) =>
      inTestTransaction(async (client) => {
        const fixture = await createOrderFixture(client);
        const id = await insertOrderStatusEvent(client, fixture);
        await expect(sql(client, statement, [id])).rejects.toMatchObject({
          code: "55000",
        });
      }),
    databaseTestTimeoutMs,
  );

  it.each([
    ["update", `UPDATE "AuditLog" SET "action" = 'EDITED' WHERE "id" = $1`],
    ["delete", `DELETE FROM "AuditLog" WHERE "id" = $1`],
  ])(
    "denies %s of an audit log row",
    (_operation, statement) =>
      inTestTransaction(async (client) => {
        const id = await insertAuditLog(client);
        await expect(sql(client, statement, [id])).rejects.toMatchObject({
          code: "55000",
        });
      }),
    databaseTestTimeoutMs,
  );

  it(
    "enforces idempotency keys per customer",
    () =>
      inTestTransaction(async (client) => {
        const fixture = await createOrderFixture(client);
        const otherCustomerId = randomUUID();
        await sql(client, `INSERT INTO "Customer" ("id") VALUES ($1)`, [
          otherCustomerId,
        ]);
        await insertOrder(
          client,
          { ...fixture, orderId: randomUUID(), customerId: otherCustomerId },
          "BF-100002",
        );
        await expect(
          insertOrder(
            client,
            { ...fixture, orderId: randomUUID() },
            "BF-100003",
          ),
        ).rejects.toMatchObject({
          code: "23505",
          constraint: "Order_customerId_idempotencyKey_key",
        });
      }),
    databaseTestTimeoutMs,
  );

  it(
    "rejects a negative item size price",
    () =>
      inTestTransaction(async (client) => {
        const itemId = await insertMenuItem(
          client,
          await insertRestaurant(client),
        );
        const statement = `INSERT INTO "ItemSize" ("menuItemId", "name", "priceMinor") VALUES ($1, $2, $3)`;
        await sql(client, statement, [itemId, "Fixture", 0]);
        await expect(
          sql(client, statement, [itemId, "Negative fixture", -1]),
        ).rejects.toMatchObject({
          code: "23514",
          constraint: "ItemSize_priceMinor_check",
        });
      }),
    databaseTestTimeoutMs,
  );

  it.each([0, 51])(
    "rejects order item quantity %i",
    (quantity) =>
      inTestTransaction(async (client) => {
        const fixture = await createOrderFixture(client);
        const itemId = await insertMenuItem(client, fixture.restaurantId);
        const sizeId = randomUUID();
        await sql(
          client,
          `INSERT INTO "ItemSize" ("id", "menuItemId", "name", "priceMinor") VALUES ($1, $2, 'Fixture', 1000)`,
          [sizeId, itemId],
        );
        const statement = `INSERT INTO "OrderItem" ("orderId", "menuItemId", "sizeId", "name", "sizeName",
          "unitPriceMinor", "totalMinor", "quantity") VALUES ($1, $2, $3, 'Fixture', 'Fixture', 1000, 1000, $4)`;
        await expect(
          sql(client, statement, [fixture.orderId, itemId, sizeId, quantity]),
        ).rejects.toMatchObject({
          code: "23514",
          constraint: "OrderItem_quantity_check",
        });
      }),
    databaseTestTimeoutMs,
  );

  it(
    "rejects inverted option group selection bounds",
    () =>
      inTestTransaction(async (client) => {
        const itemId = await insertMenuItem(
          client,
          await insertRestaurant(client),
        );
        const statement = `INSERT INTO "OptionGroup" ("menuItemId", "name", "minSelect", "maxSelect")
                         VALUES ($1, 'Fixture', 2, 1)`;
        await expect(sql(client, statement, [itemId])).rejects.toMatchObject({
          code: "23514",
          constraint: "OptionGroup_selection_bounds_check",
        });
      }),
    databaseTestTimeoutMs,
  );

  it(
    "restricts deleting a branch referenced by an order",
    () =>
      inTestTransaction(async (client) => {
        const fixture = await createOrderFixture(client);
        await expect(
          sql(client, `DELETE FROM "Branch" WHERE "id" = $1`, [
            fixture.branchId,
          ]),
        ).rejects.toMatchObject({
          code: "23001",
          constraint: "Order_branchId_fkey",
        });
      }),
    databaseTestTimeoutMs,
  );
});
