import {
  adminLoginSchema,
  restaurantLoginSchema,
  restaurantRegisterSchema,
} from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import { Prisma, type PrismaClient } from "../generated/prisma/client.ts";
import {
  findTotpTimeStep,
  hashPassword,
  verifyPassword,
} from "./credentials.js";
import type { OtpService } from "./otp.js";
import type { TokenService } from "./tokens.js";

interface CredentialRoutesOptions {
  db: PrismaClient;
  otp: OtpService;
  tokens: TokenService;
  now: () => Date;
}

async function readDefaultCommission(
  tx: Prisma.TransactionClient,
): Promise<number> {
  const setting = await tx.platformSetting.findUnique({
    where: { key: "commission.defaultRateBps" },
    select: { value: true },
  });
  const rate = setting?.value;
  if (
    typeof rate !== "number" ||
    !Number.isInteger(rate) ||
    rate < 0 ||
    rate > 10_000
  ) {
    throw new ApiError(500, "INTERNAL_ERROR");
  }
  return rate;
}

export function registerCredentialRoutes(
  api: FastifyInstance,
  { db, otp, tokens, now }: CredentialRoutesOptions,
): void {
  api.post("/auth/restaurant/register", async (request, reply) => {
    const { phone, password, code } = restaurantRegisterSchema.parse(
      request.body,
    );
    try {
      const result = await db.$transaction(async (tx) => {
        if (!(await otp.consume(phone, "RESTAURANT_REGISTER", code, tx)))
          return null;

        const commissionRateBps = await readDefaultCommission(tx);
        const restaurant = await tx.restaurant.create({
          data: {
            commissionRateBps,
            branch: { create: {} },
            users: {
              create: {
                phone,
                passwordHash: await hashPassword(password),
                role: "OWNER",
              },
            },
          },
          select: { id: true, users: { select: { id: true, role: true } } },
        });
        const owner = restaurant.users[0];
        if (!owner) throw new ApiError(500, "INTERNAL_ERROR");

        return tokens.issue(
          {
            aud: "restaurant",
            sub: owner.id,
            restaurantId: restaurant.id,
            role: owner.role,
          },
          tx,
        );
      });
      if (result === null) throw new ApiError(401, "INVALID_OTP");
      return reply.code(201).header("Cache-Control", "no-store").send(result);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const conflict = new ApiError(409, "CONFLICT");
        return reply.code(conflict.statusCode).send(conflict.envelope());
      }
      throw error;
    }
  });

  api.post("/auth/restaurant/login", async (request, reply) => {
    const { phone, password, newPassword } = restaurantLoginSchema.parse(
      request.body,
    );
    const user = await db.restaurantUser.findUnique({
      where: { phone },
      select: {
        id: true,
        restaurantId: true,
        role: true,
        passwordHash: true,
        isActive: true,
        passwordChangeRequired: true,
      },
    });
    const validPassword = await verifyPassword(password, user?.passwordHash);
    if (!user?.isActive || !validPassword)
      throw new ApiError(401, "INVALID_CREDENTIALS");

    const issueRestaurantSession = (
      account: { id: string; restaurantId: string; role: typeof user.role },
      tx?: Prisma.TransactionClient,
    ) =>
      tokens.issue(
        {
          aud: "restaurant",
          sub: account.id,
          restaurantId: account.restaurantId,
          role: account.role,
        },
        tx,
      );

    if (user.passwordChangeRequired) {
      if (newPassword === undefined)
        throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED");
      if (Buffer.from(newPassword).equals(Buffer.from(password)))
        throw new ApiError(400, "VALIDATION_ERROR");

      const passwordHash = await hashPassword(newPassword);
      const result = await db.$transaction(async (tx) => {
        const [account] = await tx.restaurantUser.updateManyAndReturn({
          where: {
            id: user.id,
            restaurantId: user.restaurantId,
            isActive: true,
            passwordChangeRequired: true,
            passwordHash: user.passwordHash,
          },
          data: { passwordHash, passwordChangeRequired: false },
          select: { id: true, restaurantId: true, role: true },
        });
        if (!account) return null;

        return issueRestaurantSession(account, tx);
      });
      if (result === null) throw new ApiError(401, "INVALID_CREDENTIALS");
      return reply.header("Cache-Control", "no-store").send(result);
    }

    if (newPassword !== undefined) throw new ApiError(400, "VALIDATION_ERROR");
    const result = await issueRestaurantSession(user);
    return reply.header("Cache-Control", "no-store").send(result);
  });

  api.post("/auth/admin/login", async (request, reply) => {
    const { email, password, totp } = adminLoginSchema.parse(request.body);
    const user = await db.adminUser.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        passwordHash: true,
        totpSecret: true,
        isActive: true,
      },
    });
    const validPassword = await verifyPassword(password, user?.passwordHash);
    if (!user?.isActive || !validPassword)
      throw new ApiError(401, "INVALID_CREDENTIALS");

    const timeStep = await findTotpTimeStep(user.totpSecret, totp, now());
    if (timeStep === null) throw new ApiError(401, "INVALID_CREDENTIALS");

    const result = await db.$transaction(async (tx) => {
      const updated = await tx.adminUser.updateMany({
        where: {
          id: user.id,
          isActive: true,
          role: user.role,
          passwordHash: user.passwordHash,
          totpSecret: user.totpSecret,
          OR: [
            { lastTotpTimeStep: null },
            { lastTotpTimeStep: { lt: timeStep } },
          ],
        },
        data: { lastTotpTimeStep: timeStep },
      });
      if (updated.count !== 1) return null;

      return tokens.issue({ aud: "admin", sub: user.id, role: user.role }, tx);
    });
    if (result === null) throw new ApiError(401, "INVALID_CREDENTIALS");

    return reply.header("Cache-Control", "no-store").send(result);
  });
}
