import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config (PRD §11.3 DoD — E2E skeleton).
 *
 * Tests are intentionally light for v1; they validate that the major
 * routes render without runtime errors and that critical first-paint
 * elements (login form, sidebar capsule, mascot) are present.
 *
 * Run `npm run e2e` after `npm install` resolves @playwright/test +
 * `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'az-AZ',
    timezoneId: 'Asia/Baku',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
