import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
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
