import {
  customerOtpRequestSchema,
  customerOtpVerifySchema,
} from "@be-fast/contracts";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { OtpService } from "./otp.js";
import type { TokenService } from "./tokens.js";

interface OtpRoutesOptions {
  db: PrismaClient;
  tokens: TokenService;
  otp: OtpService;
}

export function registerOtpRoutes(
  api: FastifyInstance,
  { db, tokens, otp }: OtpRoutesOptions,
): void {
  api.post("/auth/customer/otp/request", async (request, reply) => {
    const { phone } = customerOtpRequestSchema.parse(request.body);
    await otp.request(phone, "CUSTOMER_LOGIN", request.ip);
    return reply.code(204).send();
  });

  api.post("/auth/customer/otp/verify", async (request, reply) => {
    const { phone, code } = customerOtpVerifySchema.parse(request.body);
    const session = await db.$transaction(async (tx) => {
      if (!(await otp.consume(phone, "CUSTOMER_LOGIN", code, tx))) return null;

      const customer = await tx.customer.upsert({
        where: { phone },
        create: { phone },
        update: {},
        select: { id: true },
      });
      return tokens.issue({ aud: "customer", sub: customer.id }, tx);
    });
    if (session === null) throw new ApiError(401, "INVALID_OTP");

    return reply.code(200).header("Cache-Control", "no-store").send(session);
  });

  api.post("/auth/restaurant/otp/request", async (request, reply) => {
    const { phone } = customerOtpRequestSchema.parse(request.body);
    await otp.request(phone, "RESTAURANT_REGISTER", request.ip);
    return reply.code(204).send();
  });
}
