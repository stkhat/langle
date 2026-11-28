import { defineConfig } from "@playwright/test";

const PORT = 4719;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  // Copies of the builds that grant the test server's host (e2e/builds.ts).
  globalSetup: "./e2e/builds.ts",
  // Every test launches its own browser profile, so tests in one file run side by side.
  fullyParallel: true,
  // GitHub's Linux runners have 4 vCPUs; locally Playwright's default (half the cores).
  workers: isCI ? 4 : undefined,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["html"], ["github"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Only Chromium can load unpacked extensions.
  projects: [
    { name: "chromium", testIgnore: "phone.spec.ts" },
    {
      // A phone: m.youtube.com and articles as the mobile app's web view shows them.
      name: "phone",
      testMatch: "phone.spec.ts",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      },
    },
  ],
  webServer: {
    command: "node e2e/serve.ts",
    port: PORT,
    reuseExistingServer: !isCI,
  },
});
