import { ESLint } from "eslint";
import { describe, expect, test } from "vitest";

const eslint = new ESLint();
const customerPath = "apps/customer/src/ui-lint-fixture.tsx";

async function findings(source: string, filePath = customerPath) {
  const [result] = await eslint.lintText(source, { filePath });
  expect(result?.fatalErrorCount).toBe(0);
  return result?.messages
    .filter(({ ruleId }) => ruleId === "workspace/no-customer-ui-literals")
    .map(({ messageId }) => messageId);
}

describe("customer UI lint", () => {
  test.each([
    "export const view = <Text>مرحبا</Text>;",
    'export const field = <Input placeholder="اسم" />;',
    String.raw`export const value = "\u0645";`,
    "export const text = (name: string) => `مرحبا ${name}`;",
  ])("rejects hard-coded Arabic UI text", async (source) => {
    await expect(findings(source)).resolves.toEqual(["arabic"]);
  });

  test.each([
    'export const value = "#F36B21";',
    'export const value = "hsl(16, 100%, 50%)";',
    "export const value = (alpha: number) => `rgba(0, 0, 0, ${alpha})`;",
    'export const indicator = <ActivityIndicator color="red" />;',
    'export const gradient = <Gradient colors={[colors.ink, "red"]} />;',
    "export const styles = { shadowColor: 0xffffff };",
    'export const styles = (active: boolean) => ({ backgroundColor: active ? "transparent" : other });',
  ])("rejects literal UI colors", async (source) => {
    await expect(findings(source)).resolves.toEqual(["color"]);
  });

  test("allows imported strings and colors and unrelated interface values", async () => {
    await expect(
      findings(`
        import { messages } from "@be-fast/i18n";
        import { colors } from "@be-fast/ui-tokens";
        export const view = <Text style={{ color: colors.ink, width: 48 }}>{messages.apps.customer}</Text>;
        export const gradient = <Gradient colors={[colors.ink, colors.brand]} />;
        export const path = "https://example.test/#abc";
      `),
    ).resolves.toEqual([]);
    await expect(
      findings(
        'export const title = "اسم";',
        "packages/i18n/src/ui-lint-fixture.ts",
      ),
    ).resolves.toEqual([]);
    await expect(
      findings(
        'export const ink = "#222222";',
        "packages/ui-tokens/src/ui-lint-fixture.ts",
      ),
    ).resolves.toEqual([]);
  });
});
