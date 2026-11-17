import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import type { AdminRole, RestaurantRole } from "../generated/prisma/enums.ts";

export type Principal =
  | { aud: "customer"; sub: string }
  | {
      aud: "restaurant";
      sub: string;
      restaurantId: string;
      role: RestaurantRole;
    }
  | { aud: "admin"; sub: string; role: AdminRole };

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TokenService {
  issue(
    principal: Principal,
    tx?: Prisma.TransactionClient,
  ): Promise<TokenPair>;
  verify(accessToken: string): Promise<Principal>;
  refresh(refreshToken: string): Promise<TokenPair>;
  logout(refreshToken: string): Promise<void>;
}

interface TokenServiceOptions {
  db: PrismaClient;
  secret: Uint8Array;
  now: () => Date;
}

const issuer = "be-fast";
const accessLifetimeSeconds = 15 * 60;
const refreshLifetimeMilliseconds = 60 * 24 * 60 * 60 * 1_000;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
function digest(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex");
}

function refreshOwner(principal: Principal) {
  switch (principal.aud) {
    case "customer":
      return { customerId: principal.sub };
    case "restaurant":
      return { restaurantUserId: principal.sub };
    case "admin":
      return { adminUserId: principal.sub };
  }
}

async function lockFamily(
  tx: Prisma.TransactionClient,
  tokenHash: string,
): Promise<string | null> {
  const token = await tx.refreshToken.findUnique({
    where: { tokenHash },
    select: { familyId: true },
  });
  if (!token) return null;

  // Every rotation, reuse check, and logout locks the same first token in the family.
  const roots = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "RefreshToken" WHERE "id" = ${token.familyId}::uuid FOR UPDATE
  `;
  return roots[0]?.id ?? null;
}

async function revokeFamily(
  tx: Prisma.TransactionClient,
  familyId: string,
  revokedAt: Date,
) {
  await tx.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt },
  });
}

async function findActivePrincipal(
  db: Prisma.TransactionClient,
  aud: unknown,
  sub: string,
): Promise<Principal | null> {
  if (aud === "customer") {
    const customer = await db.customer.findUnique({
      where: { id: sub },
      select: { deletedAt: true },
    });
    return customer?.deletedAt === null ? { aud, sub } : null;
  }
  if (aud === "restaurant") {
    const user = await db.restaurantUser.findUnique({
      where: { id: sub },
      select: {
        isActive: true,
        passwordChangeRequired: true,
        restaurantId: true,
        role: true,
      },
    });
    if (user?.isActive && !user.passwordChangeRequired) {
      return { aud, sub, restaurantId: user.restaurantId, role: user.role };
    }
  }
  if (aud === "admin") {
    const user = await db.adminUser.findUnique({
      where: { id: sub },
      select: { isActive: true, role: true },
    });
    if (user?.isActive) return { aud, sub, role: user.role };
  }
  return null;
}

interface RefreshOwnerIds {
  customerId: string | null;
  restaurantUserId: string | null;
  adminUserId: string | null;
}

async function findRefreshPrincipal(
  tx: Prisma.TransactionClient,
  { customerId, restaurantUserId, adminUserId }: RefreshOwnerIds,
): Promise<Principal | null> {
  if (customerId && !restaurantUserId && !adminUserId) {
    return findActivePrincipal(tx, "customer", customerId);
  }
  if (restaurantUserId && !customerId && !adminUserId) {
    return findActivePrincipal(tx, "restaurant", restaurantUserId);
  }
  if (adminUserId && !customerId && !restaurantUserId) {
    return findActivePrincipal(tx, "admin", adminUserId);
  }
  return null;
}

export function createTokenService({
  db,
  secret,
  now,
}: TokenServiceOptions): TokenService {
  if (secret.byteLength < 32)
    throw new Error(
      "The access token signing key must contain at least 32 bytes.",
    );

  async function createPair(
    tx: Prisma.TransactionClient,
    principal: Principal,
    issuedAt: Date,
    familyId: string,
    first: boolean,
  ): Promise<TokenPair> {
    const accessIssuedAt = Math.floor(issuedAt.getTime() / 1_000);
    const claims =
      principal.aud === "restaurant"
        ? { restaurantId: principal.restaurantId, role: principal.role }
        : principal.aud === "admin"
          ? { role: principal.role }
          : {};
    const accessToken = await new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(issuer)
      .setAudience(principal.aud)
      .setSubject(principal.sub)
      .setIssuedAt(accessIssuedAt)
      .setExpirationTime(accessIssuedAt + accessLifetimeSeconds)
      .sign(secret);

    const refreshToken = randomBytes(32).toString("base64url");
    await tx.refreshToken.create({
      data: {
        ...(first ? { id: familyId } : {}),
        ...refreshOwner(principal),
        familyId,
        tokenHash: digest(refreshToken),
        expiresAt: new Date(issuedAt.getTime() + refreshLifetimeMilliseconds),
        createdAt: issuedAt,
      },
      select: { id: true },
    });
    return { accessToken, refreshToken };
  }

  return {
    issue(principal, tx = db) {
      return createPair(tx, principal, now(), randomUUID(), true);
    },

    async verify(accessToken) {
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(accessToken, secret, {
          algorithms: ["HS256"],
          typ: "JWT",
          issuer,
          requiredClaims: ["aud", "sub", "exp"],
          maxTokenAge: accessLifetimeSeconds,
          currentDate: now(),
        }));
      } catch {
        throw new ApiError(401, "UNAUTHENTICATED");
      }

      const { aud, sub } = payload;
      if (typeof sub !== "string" || !uuidPattern.test(sub)) {
        throw new ApiError(401, "UNAUTHENTICATED");
      }
      const principal = await findActivePrincipal(db, aud, sub);
      if (
        !principal ||
        (principal.aud !== "customer" && principal.role !== payload.role) ||
        (principal.aud === "restaurant" &&
          principal.restaurantId !== payload.restaurantId)
      )
        throw new ApiError(401, "UNAUTHENTICATED");
      return principal;
    },

    async refresh(refreshToken) {
      const tokenHash = digest(refreshToken);
      const pair = await db.$transaction(
        async (tx) => {
          const familyId = await lockFamily(tx, tokenHash);
          if (!familyId) return null;

          const token = await tx.refreshToken.findUnique({
            where: { tokenHash },
            select: {
              id: true,
              customerId: true,
              restaurantUserId: true,
              adminUserId: true,
              revokedAt: true,
              rotatedAt: true,
              expiresAt: true,
            },
          });
          if (!token || token.revokedAt !== null) return null;

          const issuedAt = now();
          if (token.rotatedAt !== null) {
            await revokeFamily(tx, familyId, issuedAt);
            return null;
          }
          if (token.expiresAt <= issuedAt) return null;

          const principal = await findRefreshPrincipal(tx, token);
          if (!principal) return null;

          await tx.refreshToken.update({
            where: { id: token.id },
            data: { rotatedAt: issuedAt },
          });
          return createPair(tx, principal, issuedAt, familyId, false);
        },
        { isolationLevel: "ReadCommitted" },
      );

      if (!pair) throw new ApiError(401, "INVALID_REFRESH_TOKEN");
      return pair;
    },

    async logout(refreshToken) {
      const tokenHash = digest(refreshToken);
      await db.$transaction(
        async (tx) => {
          const familyId = await lockFamily(tx, tokenHash);
          if (familyId) await revokeFamily(tx, familyId, now());
        },
        { isolationLevel: "ReadCommitted" },
      );
    },
  };
}
