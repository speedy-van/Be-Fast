import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, rm } from "node:fs/promises";
import { Client } from "pg";
import { z } from "zod";

const batchSize = 500;
const format = "be-fast-postgres-v1";
const migrationSchema = z.strictObject({
  name: z.string(),
  checksum: z.string(),
});
const manifest = z.strictObject({
  kind: z.literal("manifest"),
  format: z.literal(format),
  migrations: z.array(migrationSchema).min(1),
  tables: z.array(z.string()).min(1),
});
const batch = z.strictObject({
  kind: z.literal("batch"),
  table: z.string(),
  rows: z.array(z.string()).min(1).max(batchSize),
});
const footer = z.strictObject({
  kind: z.literal("footer"),
  counts: z.record(z.string(), z.string().regex(/^(?:0|[1-9][0-9]*)$/u)),
  checksum: z.string().regex(/^[a-f0-9]{64}$/u),
});

type Database = { connectionString: string; schema?: string };
type Counts = Record<string, string>;
type Migration = z.infer<typeof migrationSchema>;

class ArchiveError extends Error {}

function identifier(name: string) {
  return '"' + name.replaceAll('"', '""') + '"';
}

function tableName(schema: string, table: string) {
  return identifier(schema) + "." + identifier(table);
}

async function inTransaction<Result>(
  database: Database,
  readOnly: boolean,
  action: (client: Client, schema: string) => Promise<Result>,
) {
  const url = URL.parse(database.connectionString);
  const overrides = [
    "host",
    "hostaddr",
    "port",
    "dbname",
    "database",
    "user",
    "password",
    "ssl",
  ];
  if (
    !url ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1) ||
    url.hostname.toLowerCase().includes("-pooler") ||
    url.searchParams.getAll("sslmode").length !== 1 ||
    url.searchParams.get("sslmode") !== "verify-full" ||
    overrides.some((parameter) => url.searchParams.has(parameter))
  ) {
    throw new ArchiveError(
      "Use a direct PostgreSQL URL with sslmode=verify-full.",
    );
  }
  const schema = database.schema ?? url.searchParams.get("schema") ?? "public";
  const client = new Client({
    connectionString: url.href,
    connectionTimeoutMillis: 15_000,
  });
  let started = false;
  try {
    await client.connect();
    await client.query(
      readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN",
    );
    started = true;
    await client.query(
      "SET LOCAL TIME ZONE 'UTC'; SET LOCAL DateStyle = 'ISO, YMD'; SET LOCAL lock_timeout = '10s'",
    );
    const result = await action(client, schema);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (started) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function describeDatabase(client: Client, schema: string) {
  const migrations = await client.query<Migration & { finished: boolean }>(
    "SELECT migration_name AS name, checksum, finished_at IS NOT NULL AS finished FROM " +
      tableName(schema, "_prisma_migrations") +
      " WHERE rolled_back_at IS NULL ORDER BY migration_name",
  );
  if (
    !migrations.rows.length ||
    migrations.rows.some(({ finished }) => !finished)
  )
    throw new ArchiveError(
      "Apply the Be Fast migrations before using this archive.",
    );

  const relations = await client.query<{ name: string; kind: string }>(
    "SELECT c.relname AS name, c.relkind AS kind FROM pg_catalog.pg_class AS c " +
      "JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace " +
      "WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'S', 'f') " +
      "AND c.relname <> '_prisma_migrations' ORDER BY c.relname",
    [schema],
  );
  if (!relations.rows.length || relations.rows.some(({ kind }) => kind !== "r"))
    throw new ArchiveError(
      "This archive format requires application tables without sequences, partitions or foreign tables.",
    );

  const dependencies = await client.query<{
    child: string;
    parent: string;
    parent_schema: string;
  }>(
    "SELECT child.relname AS child, parent.relname AS parent, pn.nspname AS parent_schema " +
      "FROM pg_catalog.pg_constraint AS fk " +
      "JOIN pg_catalog.pg_class AS child ON child.oid = fk.conrelid " +
      "JOIN pg_catalog.pg_namespace AS cn ON cn.oid = child.relnamespace " +
      "JOIN pg_catalog.pg_class AS parent ON parent.oid = fk.confrelid " +
      "JOIN pg_catalog.pg_namespace AS pn ON pn.oid = parent.relnamespace " +
      "WHERE fk.contype = 'f' AND cn.nspname = $1",
    [schema],
  );
  const pending = new Set(relations.rows.map(({ name }) => name));
  if (
    dependencies.rows.some(
      ({ parent, parent_schema }) =>
        parent_schema !== schema || !pending.has(parent),
    )
  )
    throw new ArchiveError(
      "Application tables must reference tables in the same archive.",
    );

  const tables: string[] = [];
  while (pending.size) {
    const previousSize = pending.size;
    for (const name of pending) {
      if (
        dependencies.rows.some(
          ({ child, parent }) => child === name && pending.has(parent),
        )
      )
        continue;
      tables.push(name);
      pending.delete(name);
    }
    if (pending.size === previousSize)
      throw new ArchiveError(
        "Application table references must be acyclic for this archive format.",
      );
  }
  return {
    migrations: migrations.rows.map(({ name, checksum }) => ({
      name,
      checksum,
    })),
    tables,
  };
}

async function readCounts(
  client: Client,
  schema: string,
  tables: string[],
): Promise<Counts> {
  const query = tables
    .map(
      (name, index) =>
        "SELECT $" +
        (index + 1) +
        "::text AS name, count(*)::text AS count FROM " +
        tableName(schema, name),
    )
    .join(" UNION ALL ");
  const result = await client.query<{ name: string; count: string }>(
    query,
    tables,
  );
  return Object.fromEntries(
    result.rows.map(({ name, count }) => [name, count]),
  );
}

async function lockTables(
  client: Client,
  schema: string,
  tables: string[],
  mode: "ACCESS SHARE" | "SHARE ROW EXCLUSIVE",
) {
  const names = tables.map((table) => tableName(schema, table)).join(", ");
  await client.query("LOCK TABLE " + names + " IN " + mode + " MODE");
}

export async function backupDatabase(
  database: Database,
  path: string,
): Promise<Counts> {
  const archive = await open(path, "wx", 0o600);
  let complete = false;
  try {
    const hash = createHash("sha256");
    async function writeRecord(
      record: z.infer<typeof manifest> | z.infer<typeof batch>,
    ) {
      const line = JSON.stringify(record) + "\n";
      hash.update(line);
      await archive.writeFile(line);
    }
    const counts = await inTransaction(
      database,
      true,
      async (client, schema) => {
        const metadata = await describeDatabase(client, schema);
        await lockTables(client, schema, metadata.tables, "ACCESS SHARE");
        await writeRecord({ kind: "manifest", format, ...metadata });
        const counts = new Map<string, string>();
        for (const table of metadata.tables) {
          // PostgreSQL composite text preserves bigint, JSON null versus SQL NULL, and database-native types.
          await client.query(
            "DECLARE be_fast_archive NO SCROLL CURSOR FOR SELECT source::text AS record FROM " +
              tableName(schema, table) +
              " AS source",
          );
          let count = 0n;
          while (true) {
            const { rows } = await client.query<{ record: string }>(
              "FETCH FORWARD " + batchSize + " FROM be_fast_archive",
            );
            if (rows.length) {
              count += BigInt(rows.length);
              await writeRecord({
                kind: "batch",
                table,
                rows: rows.map(({ record }) => record),
              });
            }
            if (rows.length < batchSize) break;
          }
          await client.query("CLOSE be_fast_archive");
          counts.set(table, count.toString());
        }
        return Object.fromEntries(counts);
      },
    );
    await archive.writeFile(
      JSON.stringify({ kind: "footer", counts, checksum: hash.digest("hex") }) +
        "\n",
    );
    await archive.sync();
    complete = true;
    return counts;
  } finally {
    try {
      await archive.close();
    } finally {
      if (!complete) await rm(path, { force: true });
    }
  }
}

async function* readLines(path: string) {
  let pending = "";
  for await (const chunk of createReadStream(path, { encoding: "utf8" })) {
    pending += String(chunk);
    let end = pending.indexOf("\n");
    while (end >= 0) {
      yield pending.slice(0, end + 1);
      pending = pending.slice(end + 1);
      end = pending.indexOf("\n");
    }
  }
  if (pending)
    throw new ArchiveError("The backup file ended in a partial record.");
}

const records = z.discriminatedUnion("kind", [manifest, batch, footer]);

function decodeRecord(line: string) {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new ArchiveError("The backup file contains an invalid record.");
  }
  const parsed = records.safeParse(value);
  if (!parsed.success)
    throw new ArchiveError("The backup file contains an invalid record.");
  return parsed.data;
}

export async function restoreDatabase(
  database: Database,
  path: string,
): Promise<Counts> {
  return inTransaction(database, false, async (client, schema) => {
    await lockTables(
      client,
      schema,
      ["_prisma_migrations"],
      "SHARE ROW EXCLUSIVE",
    );
    const metadata = await describeDatabase(client, schema);
    const hash = createHash("sha256");
    let hasManifest = false;
    let lastTable = -1;
    let expected: Counts | undefined;
    for await (const line of readLines(path)) {
      const record = decodeRecord(line);
      if (expected)
        throw new ArchiveError("Unexpected data after the backup footer.");
      if (record.kind === "footer") {
        if (!hasManifest || record.checksum !== hash.digest("hex"))
          throw new ArchiveError("The backup integrity check failed.");
        expected = record.counts;
        continue;
      }
      hash.update(line);
      if (record.kind === "manifest") {
        if (
          hasManifest ||
          JSON.stringify(record.migrations) !==
            JSON.stringify(metadata.migrations) ||
          JSON.stringify(record.tables) !== JSON.stringify(metadata.tables)
        ) {
          throw new ArchiveError(
            "The backup and destination must have the same application schema and migrations.",
          );
        }
        await lockTables(
          client,
          schema,
          metadata.tables,
          "SHARE ROW EXCLUSIVE",
        );
        const current = await readCounts(client, schema, metadata.tables);
        if (Object.values(current).some((count) => count !== "0"))
          throw new ArchiveError(
            "The restore destination already contains application data.",
          );
        hasManifest = true;
        continue;
      }
      const index = metadata.tables.indexOf(record.table);
      if (!hasManifest || index < 0 || index < lastTable)
        throw new ArchiveError(
          "The backup contains unknown or out-of-order tables.",
        );
      lastTable = index;
      const name = tableName(schema, record.table);
      await client.query(
        "INSERT INTO " +
          name +
          " SELECT (source.record::" +
          name +
          ").* FROM pg_catalog.unnest($1::text[]) AS source(record)",
        [record.rows],
      );
    }
    if (!expected)
      throw new ArchiveError(
        "The backup file is missing its integrity footer.",
      );
    const restored = await readCounts(client, schema, metadata.tables);
    if (
      Object.keys(expected).length !== metadata.tables.length ||
      metadata.tables.some((name) => expected?.[name] !== restored[name])
    )
      throw new ArchiveError("Restored row counts do not match the backup.");
    return restored;
  });
}

if (import.meta.main) {
  try {
    const [action, path, extra] = process.argv.slice(2);
    if (
      (action !== "backup" && action !== "restore") ||
      !path ||
      extra !== undefined
    )
      throw new ArchiveError(
        "Provide one archive file to db:backup or db:restore.",
      );
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new ArchiveError("DATABASE_URL is required.");
    const work = action === "backup" ? backupDatabase : restoreDatabase;
    const counts = await work({ connectionString }, path);
    const total = Object.values(counts).reduce(
      (sum, count) => sum + BigInt(count),
      0n,
    );
    console.log(
      "Application tables: " +
        Object.keys(counts).length +
        ", rows: " +
        total +
        ".",
    );
  } catch (error) {
    // Driver and file-system diagnostics can include data, paths and connection credentials.
    let message = "The database archive operation failed.";
    if (error instanceof ArchiveError) message = error.message;
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EEXIST"
    )
      message = "The backup file already exists. Choose a new file.";
    console.error(message);
    process.exitCode = 1;
  }
}
