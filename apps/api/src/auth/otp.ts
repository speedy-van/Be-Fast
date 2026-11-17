import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { maskPhone } from "@be-fast/domain";
import type { FastifyBaseLogger } from "fastify";
import { ApiError } from "../errors.js";
import type {
  OtpPurpose,
  Prisma,
  PrismaClient,
} from "../generated/prisma/client.js";

const hourMs = 60 * 60 * 1_000;
const resendMs = 60 * 1_000;
const lifetimeMs = 5 * 60 * 1_000;
const attemptsLimit = 5;
const phoneSendLimit = 5;
const ipSendLimit = 20;
const phoneLockScope = 101;
const ipLockScope = 102;

export interface OtpProvider {
  send(phone: string, code: string): Promise<void>;
}

export class DevOtpProvider implements OtpProvider {
  constructor(private readonly logger: Pick<FastifyBaseLogger, "info">) {}

  async send(phone: string, code: string): Promise<void> {
    this.logger.info({ phone: maskPhone(phone), code }, "Development OTP");
  }
}

interface OtpServiceOptions {
  db: PrismaClient;
  secret: Uint8Array;
  now: () => Date;
  provider: OtpProvider;
}

async function lockOtpKey(
  tx: Prisma.TransactionClient,
  scope: number,
  value: string,
) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${scope}::integer, hashtext(${value}))`;
}

export function createOtpService({
  db,
  secret,
  now,
  provider,
}: OtpServiceOptions) {
  function hashCode(id: string, code: string): Buffer {
    return createHmac("sha256", secret)
      .update(id)
      .update("\0")
      .update(code)
      .digest();
  }

  async function request(
    phone: string,
    purpose: OtpPurpose,
    ip: string,
  ): Promise<void> {
    const code = randomInt(1_000_000).toString().padStart(6, "0");
    const id = randomUUID();

    await db.$transaction(async (tx) => {
      // Every send acquires the phone lock before the IP lock.
      await lockOtpKey(tx, phoneLockScope, phone);
      await lockOtpKey(tx, ipLockScope, ip);

      const requestedAt = now();
      const since = { gt: new Date(requestedAt.getTime() - hourMs) };
      const recent = await tx.otpChallenge.findMany({
        where: { phone, createdAt: since },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
        take: phoneSendLimit,
      });
      const lastSentAt = recent[0]?.createdAt;
      if (
        recent.length >= phoneSendLimit ||
        (lastSentAt && requestedAt.getTime() - lastSentAt.getTime() < resendMs)
      ) {
        throw new ApiError(429, "RATE_LIMITED");
      }

      const issuedToIp = await tx.otpChallenge.count({
        where: { ip, createdAt: since },
      });
      if (issuedToIp >= ipSendLimit) throw new ApiError(429, "RATE_LIMITED");

      await tx.otpChallenge.create({
        data: {
          id,
          phone,
          purpose,
          ip,
          codeHash: hashCode(id, code).toString("hex"),
          createdAt: requestedAt,
          expiresAt: new Date(requestedAt.getTime() + lifetimeMs),
        },
      });
    });

    try {
      await provider.send(phone, code);
    } catch {
      throw new ApiError(503, "OTP_UNAVAILABLE");
    }
  }

  async function consume(
    phone: string,
    purpose: OtpPurpose,
    code: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const verify = async (tx: Prisma.TransactionClient): Promise<boolean> => {
      await lockOtpKey(tx, phoneLockScope, phone);
      const verifiedAt = now();
      const challenge = await tx.otpChallenge.findFirst({
        where: { phone, purpose },
        orderBy: { createdAt: "desc" },
      });
      if (
        !challenge ||
        challenge.usedAt !== null ||
        challenge.expiresAt <= verifiedAt ||
        challenge.attempts >= attemptsLimit
      ) {
        return false;
      }

      const storedHash = Buffer.from(challenge.codeHash, "hex");
      const suppliedHash = hashCode(challenge.id, code);
      const matches =
        storedHash.length === suppliedHash.length &&
        timingSafeEqual(storedHash, suppliedHash);
      await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: matches ? { usedAt: verifiedAt } : { attempts: { increment: 1 } },
      });
      return matches;
    };

    return transaction ? verify(transaction) : db.$transaction(verify);
  }

  return { request, consume };
}

export type OtpService = ReturnType<typeof createOtpService>;
