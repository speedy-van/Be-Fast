import type {
  FastifyInstance,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from "fastify";
import { ApiError } from "../errors.js";
import type { AdminRole, RestaurantRole } from "../generated/prisma/enums.ts";
import type { Principal, TokenService } from "./tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

function principalFor<Audience extends Principal["aud"]>(
  request: FastifyRequest,
  audience: Audience,
): Extract<Principal, { aud: Audience }> {
  const { principal } = request;
  if (!principal) throw new ApiError(401, "UNAUTHENTICATED");
  if (principal.aud !== audience) throw new ApiError(403, "FORBIDDEN");
  return principal as Extract<Principal, { aud: Audience }>;
}

export function requireCustomer(request: FastifyRequest) {
  return principalFor(request, "customer");
}

export function requireRestaurant(request: FastifyRequest) {
  return principalFor(request, "restaurant");
}

export function requireAdmin(request: FastifyRequest) {
  return principalFor(request, "admin");
}

export function requireRestaurantRole(
  ...roles: RestaurantRole[]
): preHandlerAsyncHookHandler {
  return async (request) => {
    if (!roles.includes(requireRestaurant(request).role))
      throw new ApiError(403, "FORBIDDEN");
  };
}

export function requireAdminRole(
  ...roles: AdminRole[]
): preHandlerAsyncHookHandler {
  return async (request) => {
    if (!roles.includes(requireAdmin(request).role))
      throw new ApiError(403, "FORBIDDEN");
  };
}

export function registerAccessGuards(
  api: FastifyInstance,
  tokens: TokenService,
): void {
  api.decorateRequest("principal", null);

  api.addHook("onRoute", (route) => {
    const audience = /^\/(customer|restaurant|admin)(?:\/|$)/u.exec(
      route.url,
    )?.[1];
    if (!audience) return;

    const existing =
      route.onRequest === undefined ? [] : [route.onRequest].flat();
    route.onRequest = [
      async (request) => {
        const authorization = request.headers.authorization ?? "";
        const bearer = /^Bearer +([\w-]+\.[\w-]+\.[\w-]+)$/iu.exec(
          authorization,
        )?.[1];
        if (!bearer) throw new ApiError(401, "UNAUTHENTICATED");

        const principal = await tokens.verify(bearer);
        if (principal.aud !== audience) throw new ApiError(403, "FORBIDDEN");
        request.principal = principal;
      },
      ...existing,
    ];
  });
}
