import { randomUUID } from "node:crypto";
import { messages } from "@be-fast/i18n";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.js";
import { readDatabaseUrl } from "../src/config.js";

async function requestHealth(databaseUrl: string) {
  const api = createApi(databaseUrl);
  try {
    return await api.inject({ method: "GET", url: "/health" });
  } finally {
    await api.close();
  }
}

describe("GET /health", () => {
  it("returns 200 after querying the configured PostgreSQL database", async () => {
    const response = await requestHealth(readDatabaseUrl());

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns 503 when PostgreSQL cannot connect to the requested database", async () => {
    const databaseUrl = new URL(readDatabaseUrl());
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
  });
});
