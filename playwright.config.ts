import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      TEST_PROTOCOL_API_KEY: process.env.TEST_PROTOCOL_API_KEY || 'test-protocol-key',
      TEST_ADMIN_API_KEY: process.env.TEST_ADMIN_API_KEY || 'test-admin-key',
      MOLTBOT_GATEWAY_TOKEN: process.env.MOLTBOT_GATEWAY_TOKEN || 'test-protocol-key',
      ADMIN_API_KEY: process.env.ADMIN_API_KEY || 'test-admin-key',
    },
  },
})
