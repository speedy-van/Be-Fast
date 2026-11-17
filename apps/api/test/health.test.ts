import { randomUUID } from "node:crypto";
import { messages } from "@be-fast/i18n";
import { Client } from "pg";
import { describe, expect, inject, it } from "vitest";
import { createApi } from "../src/app.js";

// The runner budget includes Fastify startup and connection pool teardown.
const healthTestTimeoutMs = 20_000;

async function requestHealth(databaseUrl: string) {
  const api = createApi(databaseUrl);
  try {
    return await api.inject({ method: "GET", url: "/health" });
  } finally {
    await api.close();
  }
}

describe("GET /health", () => {
  it(
    "uses an isolated schema on the test database",
    async () => {
      const { url, schema } = inject("testDatabase");
      let rows: { schema: string }[];
      try {
        const client = new Client({
          connectionString: url,
          connectionTimeoutMillis: 10_000,
          query_timeout: 10_000,
        });
        try {
          await client.connect();
          ({ rows } = await client.query<{ schema: string }>(
            "SELECT current_schema() AS schema",
          ));
        } finally {
          await client.end();
        }
      } catch {
        throw new Error("Cannot inspect the isolated PostgreSQL test schema.");
      }
      expect(schema).toMatch(/^test_[a-f0-9]{32}$/);
      expect(rows).toEqual([{ schema }]);
    },
    healthTestTimeoutMs,
  );

  it(
    "returns 200 after querying the configured PostgreSQL database",
    async () => {
      const response = await requestHealth(inject("testDatabase").url);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    },
    healthTestTimeoutMs,
  );

  it(
    "returns 503 when PostgreSQL cannot connect to the requested database",
    async () => {
      const databaseUrl = new URL(inject("testDatabase").url);
      databaseUrl.pathname = `/missing_${randomUUID()}`;

      const response = await requestHealth(databaseUrl.href);

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: messages.errors.databaseUnavailable,
          details: {},
        },
      });
    },
    healthTestTimeoutMs,
  );
});
