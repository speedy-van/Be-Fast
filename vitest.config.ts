import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const mock = (name: string) =>
  fileURLToPath(new URL(`./tests/mocks/${name}.ts`, import.meta.url));

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["packages/domain/src/**/*.ts"],
      thresholds: { lines: 95 },
    },
    projects: [
      {
        resolve: {
          // Native animation, SVG and haptics modules cannot load in Node.
          alias: {
            "react-native-reanimated": mock("reanimated"),
            "react-native-svg": mock("svg"),
            "expo-haptics": mock("haptics"),
          },
        },
        test: {
          name: "unit",
          exclude: [...configDefaults.exclude, "apps/api/**"],
        },
      },
      {
        test: {
          name: "api",
          include: ["apps/api/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
          globalSetup: "./apps/api/test/global-setup.ts",
          // One worker owns the schema created for this run.
          fileParallelism: false,
        },
      },
    ],
  },
});
