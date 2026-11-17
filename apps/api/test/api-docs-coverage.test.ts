import { randomBytes } from "node:crypto";
import { apiRoutes } from "@be-fast/contracts/api-docs";
import { expect, inject, it } from "vitest";
import { createApi } from "../src/app.js";

it("documents every distinct registered API route", async () => {
  const scope = inject("testDatabase");
  const registered = new Set<string>();
  const api = createApi(scope.url, {
    databaseSchema: scope.schema,
    auth: { secret: randomBytes(32) },
    onRoute({ method, url }) {
      for (const verb of Array.isArray(method) ? method : [method]) {
        // Fastify exposes an automatic HEAD handler for GET routes.
        if (verb !== "HEAD") registered.add(`${verb} ${url}`);
      }
    },
  });
  try {
    await api.ready();
    const documented = apiRoutes
      .map(({ method, path }) => `${method} ${path}`)
      .sort();
    expect(new Set(documented).size).toBe(documented.length);
    expect([...registered].sort()).toEqual(documented);
  } finally {
    await api.close();
  }
});
