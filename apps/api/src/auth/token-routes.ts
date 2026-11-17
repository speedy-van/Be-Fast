import { refreshTokenSchema } from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import type { TokenService } from "./tokens.js";

export function registerTokenRoutes(
  api: FastifyInstance,
  { tokens }: { tokens: TokenService },
): void {
  api.post("/auth/refresh", async (request, reply) => {
    const { refreshToken } = refreshTokenSchema.parse(request.body);
    return reply
      .header("Cache-Control", "no-store")
      .send(await tokens.refresh(refreshToken));
  });

  api.post("/auth/logout", async (request, reply) => {
    const { refreshToken } = refreshTokenSchema.parse(request.body);
    await tokens.logout(refreshToken);
    return reply.code(204).send();
  });
}
