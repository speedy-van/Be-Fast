import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

function endpoint(url: URL): string {
  return decodeURIComponent(url.hostname).toLowerCase().replace(/\.$/u, "");
}

export function runMigrations(databaseUrl: string, schema?: string): void {
  const url = URL.parse(databaseUrl);
  if (
    !url ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    endpoint(url).includes("-pooler") ||
    url.searchParams.has("host") ||
    url.searchParams.getAll("sslmode").length !== 1 ||
    url.searchParams.get("sslmode") !== "verify-full"
  ) {
    throw new Error(
      "Migrations require a direct PostgreSQL URL with sslmode=verify-full.",
    );
  }

  // The native Prisma schema engine spells full TLS verification this way.
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("sslaccept", "strict");
  url.searchParams.set("connect_timeout", "15");
  url.searchParams.set("socket_timeout", "15");
  url.searchParams.set("pgbouncer", "false");
  if (schema !== undefined) {
    if (!/^test_[a-f0-9]{32}$/u.test(schema)) {
      throw new Error("Invalid PostgreSQL test schema name.");
    }
    url.searchParams.set("schema", schema);
    url.searchParams.delete("options");
  }

  const cli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  const result = spawnSync(process.execPath, [cli, "migrate", "deploy"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      ...process.env,
      DATABASE_URL: undefined,
      TEST_DATABASE_URL: undefined,
      BE_FAST_MIGRATION_URL: url.href,
    },
    encoding: "utf8",
    windowsHide: true,
    timeout: 45_000,
  });
  if (result.status !== 0) {
    // Prisma diagnostics can contain connection information. Emit only its error code.
    const code = /\bP[0-9]{4}\b/u.exec(result.stderr ?? "")?.[0];
    const detail = code ? ` (${code})` : "";
    throw new Error(`Prisma migration deployment failed${detail}.`);
  }
}

if (import.meta.main) {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl)
      throw new Error("DATABASE_URL is required for migrations.");
    const testUrl = URL.parse(process.env.TEST_DATABASE_URL ?? "");
    const devUrl = URL.parse(databaseUrl);
    if (testUrl && devUrl && endpoint(testUrl) === endpoint(devUrl)) {
      throw new Error(
        "DATABASE_URL must use a different endpoint from TEST_DATABASE_URL.",
      );
    }
    runMigrations(databaseUrl);
    console.log("PostgreSQL migrations are up to date.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Migration failed.");
    process.exitCode = 1;
  }
}
