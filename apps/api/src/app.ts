import { messages } from "@be-fast/i18n";
import Fastify from "fastify";
import { Pool } from "pg";

export function createApi(databaseUrl: string) {
  const api = Fastify();
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000,
    query_timeout: 2_000,
  });

  pool.on("error", () => {
    api.log.warn("An idle PostgreSQL connection failed.");
  });
  api.addHook("onClose", () => pool.end());

  api.get("/health", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
    } catch {
      return reply.code(503).send({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: messages.errors.databaseUnavailable,
          details: {},
        },
      });
    }

    return { status: "ok" };
  });

  return api;
}
