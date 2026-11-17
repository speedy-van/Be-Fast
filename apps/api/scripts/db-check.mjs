import console from "node:console";
import process from "node:process";
import { URL } from "node:url";
import pg from "pg";

const variables = ["DATABASE_URL", "TEST_DATABASE_URL"];
const overrideParameters = [
  "host",
  "hostaddr",
  "dbname",
  "database",
  "port",
  "user",
  "password",
  "ssl",
];

function endpointHost(url) {
  return decodeURIComponent(url.hostname).toLowerCase().replace(/\.$/u, "");
}

function readEndpoint(name) {
  try {
    const url = new URL(process.env[name] ?? "");
    const host = endpointHost(url);
    if (
      ["postgresql:", "postgres:"].includes(url.protocol) &&
      host &&
      !host.includes("-pooler") &&
      !overrideParameters.some((parameter) =>
        url.searchParams.has(parameter),
      ) &&
      url.searchParams.getAll("sslmode").length === 1 &&
      url.searchParams.get("sslmode") === "verify-full"
    ) {
      return url;
    }
  } catch {
    // Connection strings can contain credentials, so omit parser diagnostics.
  }
  throw new Error(
    `${name} must contain a direct PostgreSQL URL with sslmode=verify-full.`,
  );
}

async function readVersion(name, endpoint) {
  let client;
  try {
    client = new pg.Client({
      connectionString: endpoint.href,
      connectionTimeoutMillis: 15_000,
      query_timeout: 10_000,
    });
    await client.connect();
    const result = await client.query("SHOW server_version");
    return result.rows[0].server_version;
  } catch (error) {
    const code =
      typeof error?.code === "string" && /^[A-Z0-9_]+$/u.test(error.code)
        ? ` (${error.code})`
        : "";
    throw new Error(`${name}: PostgreSQL connection check failed${code}.`, {
      cause: error,
    });
  } finally {
    await client?.end().catch(() => undefined);
  }
}

try {
  const endpoints = variables.map(readEndpoint);
  if (endpointHost(endpoints[0]) === endpointHost(endpoints[1])) {
    throw new Error(
      "DATABASE_URL and TEST_DATABASE_URL must use different endpoints.",
    );
  }
  const versions = await Promise.all(
    variables.map((name, index) => readVersion(name, endpoints[index])),
  );
  for (const version of versions) {
    console.log(version);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
