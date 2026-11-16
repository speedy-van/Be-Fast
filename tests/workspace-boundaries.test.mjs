import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();
// ESLint loads the TypeScript parser on the first case.
const lintTestTimeoutMs = 60_000;

async function boundaryErrors(code, filePath) {
  const results = await eslint.lintText(code, { filePath });
  return results.flatMap(({ messages }) =>
    messages.filter(
      ({ ruleId }) => ruleId === "workspace/no-application-imports",
    ),
  );
}

describe("workspace import boundaries", () => {
  it.each([
    [
      'export * from "../../restaurant/src/index.js";',
      "apps/customer/src/example.ts",
    ],
    ['import "@be-fast/customer/app";', "apps/api/src/example.ts"],
    [
      'export const load = () => import("admin");',
      "apps/restaurant/src/example.ts",
    ],
    [
      'export type Example = import("api").Example;',
      "apps/restaurant/src/example.ts",
    ],
    [
      'export * from "../../apps/api/src/index.js";',
      "packages/api-client/example.ts",
    ],
    [
      'export const load = () => require("restaurant");',
      "apps/admin/example.cjs",
    ],
  ])(
    "rejects %s in %s",
    async (code, filePath) => {
      expect(await boundaryErrors(code, filePath)).toHaveLength(1);
    },
    lintTestTimeoutMs,
  );

  it("allows importing local code and shared packages", async () => {
    const code = 'import "../helper.js"; import "@be-fast/contracts";';
    expect(
      await boundaryErrors(code, "apps/customer/src/example.ts"),
    ).toHaveLength(0);
  });
});
