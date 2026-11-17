import { createHmac } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  adminE2eApiUrl,
  adminE2eFixtureEnv,
  type AdminE2eCredential,
  type AdminE2eFixtures,
} from "./protocol.js";

const viewport = { width: 360, height: 800 };
const labels = {
  email: "البريد الإلكتروني",
  password: "كلمة المرور",
  totp: "رمز المصادقة",
  login: "تسجيل الدخول",
  restaurants: "المطاعم",
  finance: "المالية",
  orders: "الطلبات",
  audit: "سجل التدقيق",
  reason: "السبب",
  confirm: "تأكيد",
};

function fixtures(): AdminE2eFixtures {
  const raw = process.env[adminE2eFixtureEnv];
  if (!raw) throw new Error("The admin journey fixtures were not initialized.");
  return JSON.parse(raw) as AdminE2eFixtures;
}

function totpNow(secret: string) {
  // RFC 6238 uses an eight-byte counter of elapsed 30-second time steps.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const key: number[] = [];
  let accumulator = 0;
  let bits = 0;
  for (const char of secret) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error("The test fixture TOTP secret is invalid.");
    accumulator = (accumulator << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      key.push(accumulator >> bits);
      accumulator &= (1 << bits) - 1;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", Buffer.from(key)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 15;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

async function login(page: Page, credentials: AdminE2eCredential) {
  await page.goto("/login");
  try {
    await page
      .getByLabel(labels.email, { exact: true })
      .fill(credentials.email);
    await page
      .getByLabel(labels.password, { exact: true })
      .fill(credentials.password);
    await page
      .getByLabel(labels.totp, { exact: true })
      .fill(totpNow(credentials.totpSecret));
    await page.getByRole("button", { name: labels.login, exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
  } catch {
    // Clear submitted credentials before Playwright captures failure diagnostics.
    await page.goto("about:blank", { timeout: 3000 }).catch(() => undefined);
    throw new Error("The TOTP login did not reach the dashboard.");
  }
}

async function openSection(page: Page, name: string, path: string) {
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === path);
  await expect(
    page.getByRole("heading", { level: 1, name, exact: true }),
  ).toBeVisible();
}

async function expectLocalizedAndReadable(page: Page) {
  const root = page.locator("html");
  await expect(root).toHaveAttribute("dir", "rtl");
  await expect(root).toHaveAttribute("lang", "ar");
  const visibleText = (await page.locator("body").innerText())
    .replaceAll(/\bBF-\d{6}\b/gu, "")
    .replaceAll(/\b[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\b/giu, "")
    .replaceAll(/[\w.-]+@example\.test/gu, "");
  expect(visibleText).not.toMatch(/[a-z]/iu);
  expect(await root.evaluate((html) => html.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
  const result = await new AxeBuilder({ page })
    .withRules(["color-contrast"])
    .analyze();
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ target }) => target),
    })),
  ).toEqual([]);
}

test.use({ viewport });

test("admin signs in with TOTP, approves, settles a payment and audits cancellation", async ({
  page,
  request,
}) => {
  const fixture = fixtures();
  const publicRestaurantsUrl = `${adminE2eApiUrl}/public/restaurants?neighborhoodId=${fixture.restaurant.neighborhoodId}`;

  await test.step("TOTP login and Arabic RTL dashboard at 360 pixels", async () => {
    await page.goto("/finance");
    await expect(page).toHaveURL((url) => url.pathname === "/login");
    await expectLocalizedAndReadable(page);
    await login(page, fixture.accounts.superAdmin);
    await expect(
      page.getByRole("link", { name: labels.restaurants, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /الطلبات النشطة/u }),
    ).toBeVisible();
    await expectLocalizedAndReadable(page);
  });

  await test.step("approve the pending restaurant and see it in the public API", async () => {
    const before = await request.get(publicRestaurantsUrl);
    expect(before.status()).toBe(200);
    expect(await before.json()).toMatchObject({ restaurants: [] });
    await openSection(page, labels.restaurants, "/restaurants");
    await page
      .getByRole("button", { name: fixture.restaurant.name, exact: true })
      .click();
    await page
      .getByRole("button", { name: "الموافقة على المطعم", exact: true })
      .click();
    const reason = page.getByLabel(labels.reason, { exact: true });
    await expect(reason).toHaveAttribute("required", "");
    await reason.fill("اكتملت مراجعة بيانات المطعم");
    await page
      .getByRole("button", { name: labels.confirm, exact: true })
      .click();
    await expect
      .poll(async () => {
        const response = await request.get(publicRestaurantsUrl);
        expect(response.status()).toBe(200);
        return (
          (await response.json()) as { restaurants: { id: string }[] }
        ).restaurants.map(({ id }) => id);
      })
      .toContain(fixture.restaurant.id);
    await expectLocalizedAndReadable(page);
  });

  await test.step("record a payment and refresh the outstanding balance", async () => {
    await openSection(page, labels.finance, "/finance");
    const balances = page.getByRole("region", {
      name: "أرصدة المطاعم",
      exact: true,
    });
    const restaurant = balances.getByRole("button", {
      name: fixture.financeRestaurantName,
      exact: true,
    });
    await restaurant.click();
    await expect(restaurant).toHaveAttribute("aria-pressed", "true");
    const ledger = page
      .getByRole("region", { name: "كشف القيود", exact: true })
      .filter({
        has: page.getByRole("heading", {
          name: fixture.financeRestaurantName,
          exact: true,
        }),
      });
    await expect(
      ledger.getByText("8,000 ل.س", { exact: true }).first(),
    ).toBeVisible();
    await ledger
      .getByRole("button", { name: "تسجيل دفعة", exact: true })
      .click();
    await page.getByLabel("المبلغ بوحدته الصغرى", { exact: true }).fill("2500");
    await page
      .getByLabel("تاريخ الدفعة", { exact: true })
      .fill(new Date().toISOString().slice(0, 10));
    await page.getByLabel("طريقة الدفع", { exact: true }).fill("نقداً");
    await page
      .getByLabel("المرجع", { exact: true })
      .fill("إيصال الدفعة الاختبارية");
    await page
      .getByRole("button", { name: labels.confirm, exact: true })
      .click();
    await expect(ledger.getByText("5,500 ل.س", { exact: true })).toBeVisible();
    await expectLocalizedAndReadable(page);
  });

  await test.step("cancel an accepted order and see the audit entry", async () => {
    await openSection(page, labels.orders, "/orders");
    const order = page.getByRole("button", {
      name: fixture.order.orderNumber,
      exact: true,
    });
    await order.click();
    const orderRow = page.getByRole("listitem").filter({ has: order });
    await page
      .getByRole("button", { name: "إلغاء الطلب", exact: true })
      .click();
    const reason = page.getByRole("combobox", {
      name: labels.reason,
      exact: true,
    });
    await expect(reason).toHaveAttribute("required", "");
    await reason.selectOption({ label: "بناءً على طلب العميل" });
    const cancelled = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith(
          `/orders/${fixture.order.id}/cancel`,
        ),
    );
    await page
      .getByRole("button", { name: labels.confirm, exact: true })
      .click();
    expect((await cancelled).status()).toBe(200);
    await expect(orderRow.getByText("ملغى", { exact: true })).toBeVisible();
    await expectLocalizedAndReadable(page);
    await openSection(page, labels.audit, "/audit");
    const audit = page
      .getByRole("listitem")
      .filter({ has: page.getByText(fixture.order.id, { exact: true }) });
    await expect(audit.getByText("إلغاء طلب", { exact: true })).toBeVisible();
    await expectLocalizedAndReadable(page);
  });
});

test("Support sees no financial control and cannot access the direct API", async ({
  page,
  request,
}) => {
  const { accounts } = fixtures();
  await login(page, accounts.support);
  await expect(
    page.getByRole("link", { name: labels.orders, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: labels.finance, exact: true }),
  ).toHaveCount(0);
  await page.goto("/finance");
  await expect(
    page.getByRole("button", { name: "تسجيل دفعة", exact: true }),
  ).toHaveCount(0);
  await expectLocalizedAndReadable(page);

  const loginResponse = await request.post(
    `${adminE2eApiUrl}/auth/admin/login`,
    {
      data: {
        email: accounts.supportApi.email,
        password: accounts.supportApi.password,
        totp: totpNow(accounts.supportApi.totpSecret),
      },
    },
  );
  expect(loginResponse.status()).toBe(200);
  const { accessToken } = (await loginResponse.json()) as {
    accessToken?: string;
  };
  if (!accessToken)
    throw new Error("The direct Support login did not issue a token.");
  const direct = await request.get(
    `${adminE2eApiUrl}/admin/finance/restaurants`,
    {
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  expect(direct.status()).toBe(403);
});
