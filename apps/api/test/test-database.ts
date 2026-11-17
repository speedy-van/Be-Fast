import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { runMigrations } from "../prisma/migrate.ts";

const operationTimeoutMs = 10_000;
const warmupTimeoutMs = 30_000;
const connectionOverrides = [
  "host",
  "hostaddr",
  "dbname",
  "database",
  "port",
  "user",
  "password",
  "ssl",
];

function endpoint(url: URL | null): string | undefined {
  try {
    return url && url.hostname
      ? decodeURIComponent(url.hostname).toLowerCase().replace(/\.$/u, "")
      : undefined;
  } catch {
    return undefined;
  }
}

function readTestDatabaseUrl(): URL {
  let localEnv: ReturnType<typeof parseEnv> = {};
  if (existsSync(".env")) {
    try {
      localEnv = parseEnv(readFileSync(".env", "utf8"));
    } catch {
      throw new Error("Cannot read the local environment file for API tests.");
    }
  }

  const testUrl = process.env.TEST_DATABASE_URL ?? localEnv.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error("TEST_DATABASE_URL is required for API tests.");
  }

  const url = URL.parse(testUrl);
  const testEndpoint = endpoint(url);
  if (
    !url ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !testEndpoint ||
    !url.pathname.slice(1) ||
    /-pooler(?:\.|$)/u.test(testEndpoint) ||
    url.searchParams.get("sslmode") !== "verify-full" ||
    url.searchParams.getAll("sslmode").length !== 1 ||
    connectionOverrides.some((key) => url.searchParams.has(key))
  ) {
    throw new Error(
      "TEST_DATABASE_URL must use a direct PostgreSQL endpoint with sslmode=verify-full.",
    );
  }

  if (
    [process.env.DATABASE_URL, localEnv.DATABASE_URL].some(
      (devUrl) =>
        devUrl &&
        (testUrl === devUrl || testEndpoint === endpoint(URL.parse(devUrl))),
    )
  ) {
    throw new Error(
      "TEST_DATABASE_URL must use a different endpoint from DATABASE_URL.",
    );
  }

  return url;
}

function createClient(url: URL): Client {
  try {
    return new Client({
      connectionString: url.href,
      connectionTimeoutMillis: operationTimeoutMs,
      query_timeout: operationTimeoutMs,
    });
  } catch {
    throw new Error("Invalid PostgreSQL test connection configuration.");
  }
}

async function connectWithWarmup(url: URL): Promise<Client> {
  const deadline = performance.now() + warmupTimeoutMs;
  do {
    const client = createClient(url);
    try {
      await client.connect();
      return client;
    } catch {
      await client.end().catch(() => undefined);
    }

    const remainingMs = deadline - performance.now();
    if (remainingMs <= operationTimeoutMs) {
      break;
    }
    await delay(Math.min(1_000, remainingMs - operationTimeoutMs));
  } while (performance.now() + operationTimeoutMs <= deadline);

  throw new Error(
    "Cannot connect to the PostgreSQL test database within 30 seconds.",
  );
}

async function dropSchema(url: URL, schema: string) {
  try {
    const client = createClient(url);
    try {
      await client.connect();
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await client.end();
    }
  } catch {
    throw new Error(`Could not remove the PostgreSQL test schema ${schema}.`);
  }
}

export async function openTestDatabase() {
  const url = readTestDatabaseUrl();
  const client = await connectWithWarmup(url);
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  try {
    try {
      try {
        await client.query(`CREATE SCHEMA "${schema}"`);
      } finally {
        await client.end();
      }
    } catch {
      throw new Error("Could not create an isolated PostgreSQL test schema.");
    }

    runMigrations(url.href, schema);
    const scopedUrl = new URL(url);
    const options = scopedUrl.searchParams.get("options");
    scopedUrl.searchParams.set(
      "options",
      `${options ? `${options} ` : ""}-c search_path=${schema}`,
    );
    return {
      url: scopedUrl.href,
      schema,
      close: () => dropSchema(url, schema),
    };
  } catch (error) {
    await dropSchema(url, schema);
    throw error;
  }
}
