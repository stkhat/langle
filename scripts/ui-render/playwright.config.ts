// The interface-language render sweep (sweep.spec.ts), apart from the E2E suite.
import { defineConfig } from "@playwright/test";

const PORT = 4719;

export default defineConfig({
  testDir: ".",
  testMatch: "sweep.spec.ts",
  // Copies of the builds that grant the test server's host (e2e/builds.ts).
  globalSetup: "../../e2e/builds.ts",
  fullyParallel: true,
  workers: Number(process.env.WORKERS ?? 4),
  reporter: "line",
  outputDir: "../../test-results/ui-render",
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: "node e2e/serve.ts",
    cwd: "../..",
    port: PORT,
    reuseExistingServer: true,
  },
});
