import { fork } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import {
  adminE2eApiPort,
  adminE2eFixtureEnv,
  type AdminE2eStartup,
} from "./protocol.js";

export default async function setupAdminE2e() {
  const server = fork(
    fileURLToPath(
      new URL("../apps/api/test/admin-e2e-server.ts", import.meta.url),
    ),
    [],
    {
      env: { ...process.env, BE_FAST_ADMIN_E2E_PORT: String(adminE2eApiPort) },
      execArgv: [],
      // The child sends only safe diagnostics and ephemeral test fixtures by IPC.
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  const exit = once(server, "exit");
  async function close() {
    delete process.env[adminE2eFixtureEnv];
    if (server.connected) server.disconnect();
    const [code] = await exit;
    if (code !== 0) throw new Error("The admin test API did not exit cleanly.");
  }

  try {
    const signal = AbortSignal.timeout(120_000);
    const startup = await Promise.race([
      once(server, "message", { signal }).then(
        ([message]) => message as AdminE2eStartup,
      ),
      exit.then(() => {
        throw new Error("The admin test API exited before it was ready.");
      }),
    ]);
    if (startup.status === "failed") {
      throw new Error(
        `The admin test API failed during ${startup.phase} setup.`,
      );
    }
    process.env[adminE2eFixtureEnv] = JSON.stringify(startup.fixtures);
    return close;
  } catch (error) {
    await close().catch(() => undefined);
    throw error;
  }
}
