import { mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { expect, it } from "vitest";
import { backupDatabase, restoreDatabase } from "../prisma/database-backup.ts";
import { openTestDatabase } from "./test-database.ts";

const fixtureName = 'اختبار "النسخ", \\مسار\nسطر آخر';
const fixtureMinor = "9007199254740993";

async function seedArchiveFixtures(client: Client) {
  await client.query(
    'WITH fixture_customer AS (INSERT INTO "Customer" (name, "updatedAt") VALUES ($1, now()) RETURNING id),' +
      ' fixture_restaurant AS (INSERT INTO "Restaurant" (status, "commissionRateBps", "updatedAt") VALUES (\'APPROVED\', 10000, now()) RETURNING id),' +
      ' fixture_branch AS (INSERT INTO "Branch" ("restaurantId", "updatedAt") SELECT id, now() FROM fixture_restaurant RETURNING id),' +
      ' fixture_order AS (INSERT INTO "Order" ("customerId", "branchId", "orderNumber", "idempotencyKey", type, status, "customerName",' +
      ' "foodSubtotalMinor", "deliveryFeeMinor", "totalMinor", "commissionRateBps", "commissionMinor", "updatedAt")' +
      " SELECT fixture_customer.id, fixture_branch.id, 'BF-900000', gen_random_uuid(), 'PICKUP', 'DELIVERED', $1," +
      " $2, 0, $2, 10000, $2, now() FROM fixture_customer CROSS JOIN fixture_branch RETURNING id)," +
      ' fixture_event AS (INSERT INTO "OrderStatusEvent" ("orderId", "to", "actorType") SELECT id, \'DELIVERED\', \'SYSTEM\' FROM fixture_order)' +
      ' INSERT INTO "LedgerEntry" ("restaurantId", "orderId", type, "amountMinor")' +
      " SELECT fixture_restaurant.id, fixture_order.id, 'COMMISSION_ACCRUED', $2 FROM fixture_restaurant CROSS JOIN fixture_order",
    [fixtureName, fixtureMinor],
  );
  await client.query(
    "INSERT INTO \"PlatformSetting\" (key, value, \"updatedAt\") VALUES ('archive.test.jsonNull', 'null'::jsonb, now())",
  );
}

async function counts(client: Client, schema: string) {
  const tables = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = $1 AND tablename <> '_prisma_migrations' ORDER BY tablename",
    [schema],
  );
  const result: Record<string, string> = {};
  for (const { tablename } of tables.rows) {
    const name = '"' + tablename.replaceAll('"', '""') + '"';
    const rows = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM " + name,
    );
    result[tablename] = rows.rows[0]?.count ?? "";
  }
  return result;
}

it(
  "restores a complete snapshot into a clean migrated database and rolls back an incomplete archive",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "be-fast-db-archive-"));
    const archive = join(directory, "archive.jsonl");
    const truncated = join(directory, "truncated.jsonl");
    try {
      const source = await openTestDatabase();
      try {
        const target = await openTestDatabase();
        try {
          const sourceSettings = {
            connectionString: source.url,
            schema: source.schema,
          };
          const targetSettings = {
            connectionString: target.url,
            schema: target.schema,
          };
          const options = {
            connectionTimeoutMillis: 15_000,
            query_timeout: 15_000,
          };
          const sourceClient = new Client({ ...sourceSettings, ...options });
          const targetClient = new Client({ ...targetSettings, ...options });
          try {
            await Promise.all([sourceClient.connect(), targetClient.connect()]);
            await seedArchiveFixtures(sourceClient);

            const before = await counts(sourceClient, source.schema);
            const empty = await counts(targetClient, target.schema);
            expect(Object.keys(before)).toHaveLength(30);
            expect(Object.keys(empty)).toEqual(Object.keys(before));
            expect(Object.values(empty).every((count) => count === "0")).toBe(
              true,
            );
            expect(before).toMatchObject({
              Customer: "1",
              Order: "1",
              OrderStatusEvent: "1",
              LedgerEntry: "1",
              PlatformSetting: "1",
            });
            await expect(
              backupDatabase(sourceSettings, archive),
            ).resolves.toEqual(before);
            await expect(
              backupDatabase(sourceSettings, archive),
            ).rejects.toMatchObject({ code: "EEXIST" });

            const content = (await readFile(archive, "utf8")).trimEnd();
            await writeFile(
              truncated,
              content.slice(0, content.lastIndexOf("\n") + 1),
              { mode: 0o600 },
            );
            await expect(
              restoreDatabase(targetSettings, truncated),
            ).rejects.toThrow("missing its integrity footer");
            expect(await counts(targetClient, target.schema)).toEqual(empty);

            await expect(
              restoreDatabase(targetSettings, archive),
            ).resolves.toEqual(before);
            expect(await counts(targetClient, target.schema)).toEqual(before);
            expect(
              (
                await targetClient.query(
                  'SELECT "customerName" AS name, "totalMinor"::text AS total FROM "Order"',
                )
              ).rows,
            ).toEqual([{ name: fixtureName, total: fixtureMinor }]);
            expect(
              (
                await targetClient.query(
                  'SELECT "amountMinor"::text AS amount FROM "LedgerEntry"',
                )
              ).rows,
            ).toEqual([{ amount: fixtureMinor }]);
            expect(
              (
                await targetClient.query(
                  'SELECT value IS NULL AS "sqlNull", value = \'null\'::jsonb AS "jsonNull" FROM "PlatformSetting"',
                )
              ).rows,
            ).toEqual([{ sqlNull: false, jsonNull: true }]);
            await expect(
              targetClient.query('DELETE FROM "LedgerEntry"'),
            ).rejects.toMatchObject({
              code: "55000",
              message: "LedgerEntry is append-only",
            });
            await expect(
              restoreDatabase(targetSettings, archive),
            ).rejects.toThrow("already contains application data");
            expect(await counts(targetClient, target.schema)).toEqual(before);
          } finally {
            await Promise.all([sourceClient.end(), targetClient.end()]);
          }
        } finally {
          await target.close();
        }
      } finally {
        await source.close();
      }
    } finally {
      await Promise.all([
        rm(archive, { force: true }),
        rm(truncated, { force: true }),
      ]);
      await rmdir(directory);
    }
  },
  // Two real isolated migrations, archive round trips and independent PostgreSQL counts.
  90_000,
);
