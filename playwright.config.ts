import { defineConfig } from "@playwright/test";
import {
  adminE2eApiUrl,
  adminE2eWebPort,
  adminE2eWebUrl,
} from "./e2e/protocol.js";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  outputDir: "test-results/admin",
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  forbidOnly: true,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: adminE2eWebUrl,
    channel: "chrome",
    actionTimeout: 12_000,
  },
  webServer: {
    command: `corepack pnpm --filter admin exec next start --port ${adminE2eWebPort} --hostname 127.0.0.1`,
    url: `${adminE2eWebUrl}/login`,
    env: {
      ADMIN_API_ORIGIN: adminE2eApiUrl,
      DATABASE_URL: "",
      TEST_DATABASE_URL: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
