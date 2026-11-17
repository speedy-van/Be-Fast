import { randomUUID } from "node:crypto";
import {
  adminComplaintSchema,
  financeLedgerResponseSchema,
} from "@be-fast/contracts";
import { expect, it } from "vitest";
import type { AdminRole } from "../src/generated/prisma/enums.ts";
import { openAuthTest } from "./auth-test-support.js";

type FinanceTest = ReturnType<typeof openAuthTest>;
const integrationTimeoutMs = 40_000;

function auth(accessToken: string) {
  return { authorization: `Bearer ${accessToken}` };
}

async function createAdmin({ db, tokens }: FinanceTest, role: AdminRole) {
  const admin = await db.adminUser.create({
    data: {
      email: `finance-complaint-${randomUUID()}@example.invalid`,
      passwordHash: "Fixture",
      totpSecret: "Fixture",
      role,
    },
  });
  const { accessToken } = await tokens.issue({
    aud: "admin",
    sub: admin.id,
    role,
  });
  return { id: admin.id, headers: auth(accessToken) };
}

async function createDeliveredOrder({ db, tokens, clock }: FinanceTest) {
  const customer = await db.customer.create({
    data: { name: "Fixture customer" },
  });
  const { accessToken } = await tokens.issue({
    aud: "customer",
    sub: customer.id,
  });
  const branch = await db.branch.create({
    data: {
      restaurant: {
        create: {
          name: "Fixture restaurant",
          contactPhone: "+963956920901",
          status: "APPROVED",
          commissionRateBps: 1000,
        },
      },
    },
  });
  const order = await db.order.create({
    data: {
      branchId: branch.id,
      customerId: customer.id,
      orderNumber: `BF-${randomUUID()}`,
      idempotencyKey: randomUUID(),
      type: "DELIVERY",
      status: "DELIVERED",
      createdAt: clock.now,
      finishedAt: clock.now,
      customerName: "Fixture customer",
      foodSubtotalMinor: 8000n,
      deliveryFeeMinor: 1000n,
      totalMinor: 9000n,
      commissionRateBps: 1000,
      commissionMinor: 800n,
      ledgerEntries: {
        create: {
          restaurantId: branch.restaurantId,
          type: "COMMISSION_ACCRUED",
          amountMinor: 800n,
          createdAt: clock.now,
        },
      },
    },
  });
  return {
    order,
    customerHeaders: auth(accessToken),
    restaurantId: branch.restaurantId,
  };
}

async function fileNonDeliveryComplaint(
  { api }: FinanceTest,
  { order, customerHeaders }: Awaited<ReturnType<typeof createDeliveredOrder>>,
) {
  const created = await api.inject({
    method: "POST",
    url: `/customer/orders/${order.id}/complaint`,
    headers: customerHeaders,
    payload: { type: "NOT_RECEIVED", text: "Fixture complaint" },
  });
  expect(created.statusCode).toBe(201);
  return `/admin/complaints/${created.json<{ id: string }>().id}`;
}

async function verifyNonDelivery(
  { api }: FinanceTest,
  url: string,
  { headers }: Awaited<ReturnType<typeof createAdmin>>,
) {
  const verification = await api.inject({
    method: "PATCH",
    url,
    headers,
    payload: { verifyNonDelivery: true, internalNotes: "Fixture verification" },
  });
  expect(verification.statusCode).toBe(200);
  return adminComplaintSchema.parse(verification.json());
}

it(
  "lets only SUPER_ADMIN settle proven non-delivery and reverses commission once per order",
  async () => {
    const test = openAuthTest();
    const { api, db } = test;
    try {
      const setup = await createDeliveredOrder(test);
      const [support, operations, finance, superAdmin] = await Promise.all([
        createAdmin(test, "SUPPORT"),
        createAdmin(test, "OPERATIONS"),
        createAdmin(test, "FINANCE"),
        createAdmin(test, "SUPER_ADMIN"),
      ]);
      const url = await fileNonDeliveryComplaint(test, setup);
      const settle = {
        method: "POST" as const,
        url: `${url}/resolve-non-delivery`,
      };

      const unverified = await api.inject({
        ...settle,
        headers: superAdmin.headers,
      });
      expect(unverified.statusCode).toBe(409);
      const verified = await verifyNonDelivery(test, url, support);
      expect(verified.status).toBe("IN_PROGRESS");

      for (const reviewer of [support, operations, finance]) {
        const forbidden = await api.inject({
          ...settle,
          headers: reviewer.headers,
        });
        expect(forbidden.statusCode).toBe(403);
      }
      const invalid = await api.inject({
        ...settle,
        headers: superAdmin.headers,
        payload: { amountMinor: -1 },
      });
      expect(invalid.statusCode).toBe(400);

      const resolve = () =>
        api.inject({ ...settle, headers: superAdmin.headers });
      const results = await Promise.all([resolve(), resolve()]);
      for (const result of results) {
        expect(result.statusCode).toBe(200);
        expect(adminComplaintSchema.parse(result.json())).toMatchObject({
          id: verified.id,
          status: "RESOLVED",
        });
      }

      const customerResponse = await api.inject({
        url: `/customer/orders/${setup.order.id}/complaint`,
        headers: setup.customerHeaders,
      });
      expect(customerResponse.json()).toMatchObject({
        complaint: { status: "RESOLVED" },
      });
      expect(
        customerResponse.json<{ complaint: unknown }>().complaint,
      ).not.toHaveProperty("internalNotes");
      const entries = await db.ledgerEntry.findMany({
        where: { orderId: setup.order.id },
      });
      expect(entries).toHaveLength(2);
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "COMMISSION_ACCRUED",
            amountMinor: 800n,
          }),
          expect.objectContaining({
            type: "ADJUSTMENT",
            amountMinor: -800n,
            createdByAdminId: superAdmin.id,
            restaurantId: setup.restaurantId,
          }),
        ]),
      );
      const reversal = entries.find(({ type }) => type === "ADJUSTMENT")!;
      const ledgerResponse = await api.inject({
        url: `/admin/finance/restaurants/${setup.restaurantId}/ledger`,
        headers: superAdmin.headers,
      });
      expect(ledgerResponse.statusCode).toBe(200);
      expect(
        financeLedgerResponseSchema
          .parse(ledgerResponse.json())
          .entries.find(({ id }) => id === reversal.id),
      ).toMatchObject({ reference: null, amountMinor: -800 });
      const settlementAudits = await db.auditLog.findMany({
        where: { adminUserId: superAdmin.id },
      });
      expect(settlementAudits).toHaveLength(2);
      expect(settlementAudits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "LEDGER_ADJUSTMENT_CREATE",
            entityType: "LedgerEntry",
            entityId: reversal.id,
            after: expect.objectContaining({ amountMinor: -800 }),
          }),
          expect.objectContaining({
            action: "COMPLAINT_RESOLVE_NON_DELIVERY",
            entityType: "Complaint",
            entityId: verified.id,
            before: expect.objectContaining({ status: "IN_PROGRESS" }),
            after: expect.objectContaining({
              status: "RESOLVED",
              ledgerEntryId: reversal.id,
            }),
          }),
        ]),
      );

      const laterUrl = await fileNonDeliveryComplaint(test, setup);
      const laterComplaint = await verifyNonDelivery(
        test,
        laterUrl,
        operations,
      );
      const later = await api.inject({
        ...settle,
        url: `${laterUrl}/resolve-non-delivery`,
        headers: superAdmin.headers,
      });
      expect(later.statusCode).toBe(200);
      expect(adminComplaintSchema.parse(later.json())).toMatchObject({
        id: laterComplaint.id,
        status: "RESOLVED",
      });
      const orderAdjustments = await db.ledgerEntry.findMany({
        where: { orderId: setup.order.id, type: "ADJUSTMENT" },
      });
      expect(orderAdjustments.map(({ id }) => id)).toEqual([reversal.id]);
      await expect(
        db.ledgerEntry.create({
          data: {
            restaurantId: setup.restaurantId,
            orderId: setup.order.id,
            type: "ADJUSTMENT",
            amountMinor: -800n,
            reference: reversal.reference,
            reason: reversal.reason,
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    } finally {
      await api.close();
    }
  },
  integrationTimeoutMs,
);

it(
  "rolls back closure, reversal and ledger audit when the final complaint audit fails",
  async () => {
    const test = openAuthTest();
    const { api, db } = test;
    try {
      const setup = await createDeliveredOrder(test);
      const support = await createAdmin(test, "SUPPORT");
      const superAdmin = await createAdmin(test, "SUPER_ADMIN");
      const url = await fileNonDeliveryComplaint(test, setup);
      const complaint = await verifyNonDelivery(test, url, support);
      const resolve = () =>
        api.inject({
          method: "POST",
          url: `${url}/resolve-non-delivery`,
          headers: superAdmin.headers,
        });

      await db.$executeRaw`
        ALTER TABLE "AuditLog" ADD CONSTRAINT "test_reject_non_delivery_audit"
        CHECK ("action" <> 'COMPLAINT_RESOLVE_NON_DELIVERY') NOT VALID
      `;
      try {
        expect((await resolve()).statusCode).toBe(500);
        expect(
          await db.complaint.findUnique({ where: { id: complaint.id } }),
        ).toMatchObject({
          status: "IN_PROGRESS",
        });
        expect(
          await db.ledgerEntry.count({
            where: { orderId: setup.order.id, type: "ADJUSTMENT" },
          }),
        ).toBe(0);
        expect(
          await db.auditLog.count({ where: { adminUserId: superAdmin.id } }),
        ).toBe(0);
      } finally {
        await db.$executeRaw`ALTER TABLE "AuditLog" DROP CONSTRAINT "test_reject_non_delivery_audit"`;
      }

      expect((await resolve()).statusCode).toBe(200);
      expect(
        await db.complaint.findUnique({ where: { id: complaint.id } }),
      ).toMatchObject({
        status: "RESOLVED",
      });
      expect(
        await db.ledgerEntry.count({
          where: { orderId: setup.order.id, type: "ADJUSTMENT" },
        }),
      ).toBe(1);
    } finally {
      await api.close();
    }
  },
  integrationTimeoutMs,
);
