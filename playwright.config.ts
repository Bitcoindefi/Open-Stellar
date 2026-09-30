import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.E2E_PORT || "3000";
const baseURL = process.env.BASE_URL || `http://localhost:${e2ePort}`;

/**
 * Playwright E2E configuration for Open-Stellar
 * Tests critical user flows with mocked wallet/payment interactions
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "html" : "list",

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: `npm run dev -- --port ${e2ePort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      DEV_MODE: "true",
      ADMIN_API_KEY: "osk_admin_live_master_key_1234567890abcdef",
    },
  },
});
