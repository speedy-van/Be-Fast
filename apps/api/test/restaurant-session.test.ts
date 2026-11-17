import { restaurantSessionSchema } from "@be-fast/contracts";
import { expect, it } from "vitest";
import { openAuthTest } from "./auth-test-support.js";

it("loads restaurant app settings and clock from the authenticated restaurant", async () => {
  const { api, db, clock, tokens } = openAuthTest();
  try {
    const [owner, kitchen, customer] = await Promise.all([
      db.restaurantUser.create({
        data: {
          phone: "+963900001701",
          role: "OWNER",
          passwordHash: "unused",
          restaurant: {
            create: {
              commissionRateBps: 1_000,
              status: "APPROVED",
              branch: { create: { acceptingOrders: true } },
            },
          },
        },
      }),
      db.restaurantUser.create({
        data: {
          phone: "+963900001702",
          role: "KITCHEN",
          passwordHash: "unused",
          restaurant: {
            create: {
              commissionRateBps: 1_000,
              status: "DRAFT",
              branch: { create: {} },
            },
          },
        },
      }),
      db.customer.create({ data: {} }),
    ]);
    const request = (access: string, path = "/restaurant/session") =>
      api.inject({
        method: "GET",
        url: path,
        headers: { authorization: `Bearer ${access}` },
      });
    const credentials = (employee: typeof owner) =>
      tokens.issue({
        aud: "restaurant",
        sub: employee.id,
        restaurantId: employee.restaurantId,
        role: employee.role,
      });
    const [ownerToken, kitchenToken, customerToken] = await Promise.all([
      credentials(owner),
      credentials(kitchen),
      tokens.issue({ aud: "customer", sub: customer.id }),
    ]);
    const ownerResponse = await request(ownerToken.accessToken);
    expect(ownerResponse.statusCode).toBe(200);
    expect(ownerResponse.headers["cache-control"]).toBe("no-store");
    const ownerSession = restaurantSessionSchema.parse(ownerResponse.json());
    expect(ownerSession).toMatchObject({
      restaurantId: owner.restaurantId,
      role: "OWNER",
      restaurantStatus: "APPROVED",
      serverTime: clock.now.toISOString(),
      acceptingOrders: true,
    });
    const kitchenResponse = await request(
      kitchenToken.accessToken,
      `/restaurant/session?restaurantId=${owner.restaurantId}`,
    );
    expect(kitchenResponse.statusCode).toBe(200);
    expect(restaurantSessionSchema.parse(kitchenResponse.json())).toEqual({
      ...ownerSession,
      restaurantId: kitchen.restaurantId,
      role: "KITCHEN",
      restaurantStatus: "DRAFT",
      acceptingOrders: false,
    });
    expect((await request(customerToken.accessToken)).statusCode).toBe(403);
  } finally {
    await api.close();
  }
});
