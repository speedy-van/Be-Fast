import { TERMINAL_STATES } from "@be-fast/domain";
import { deletedCustomerName } from "@be-fast/i18n";
import type { FastifyInstance } from "fastify";
import { requireCustomer } from "../auth/access.js";
import { lockOtpPhone } from "../auth/otp.js";
import { ApiError } from "../errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";

async function eraseOrderIdentity(
  tx: Prisma.TransactionClient,
  customerId: string,
) {
  await tx.$executeRaw`
    UPDATE "Order"
    SET "customerName" = ${deletedCustomerName},
        "customerPhone" = NULL,
        "addressSnapshot" = NULLIF(jsonb_strip_nulls(jsonb_build_object(
          'neighborhoodId', "addressSnapshot"->'neighborhoodId',
          'neighborhoodName', "addressSnapshot"->'neighborhoodName',
          'cityName', "addressSnapshot"->'cityName',
          'governorateName', "addressSnapshot"->'governorateName'
        )), '{}'::jsonb)
    WHERE "customerId" = ${customerId}::uuid
  `;
}

async function deleteAccount(
  tx: Prisma.TransactionClient,
  customerId: string,
  now: () => Date,
) {
  const contact = await tx.customer.findUnique({
    where: { id: customerId, deletedAt: null },
    select: { phone: true },
  });
  if (!contact) throw new ApiError(404, "NOT_FOUND");

  // An OTP login locks its phone before touching the customer row.
  if (contact.phone) await lockOtpPhone(tx, contact.phone);
  const [account] = await tx.$queryRaw<{ phone: string | null }[]>`
    SELECT "phone" FROM "Customer"
    WHERE "id" = ${customerId}::uuid AND "deletedAt" IS NULL FOR UPDATE
  `;
  if (!account) throw new ApiError(404, "NOT_FOUND");

  // Creation uses this same customer lock, so no new order can enter after this check.
  const activeOrder = await tx.order.findFirst({
    where: { customerId, status: { notIn: [...TERMINAL_STATES] } },
    select: { id: true },
  });
  if (activeOrder) throw new ApiError(409, "ACTIVE_ORDERS");

  const deletedAt = now();
  await tx.customer.update({
    where: { id: customerId },
    data: { name: deletedCustomerName, phone: null, deletedAt },
  });
  await tx.customerAddress.deleteMany({ where: { customerId } });
  await tx.refreshToken.deleteMany({ where: { customerId } });
  if (account.phone) {
    // Erase outstanding codes and keep the existing OTP rate-limit window.
    await tx.otpChallenge.updateMany({
      where: {
        phone: account.phone,
        purpose: "CUSTOMER_LOGIN",
        usedAt: null,
        expiresAt: { gt: deletedAt },
      },
      data: { usedAt: deletedAt, codeHash: "" },
    });
  }
  await eraseOrderIdentity(tx, customerId);
}

export function registerCustomerAccountRoutes(
  api: FastifyInstance,
  { db, now }: { db: PrismaClient; now: () => Date },
) {
  api.delete("/customer/me", async (request, reply) => {
    const { sub: customerId } = requireCustomer(request);
    await db.$transaction((tx) => deleteAccount(tx, customerId, now));
    return reply.code(204).header("Cache-Control", "no-store").send();
  });
}
