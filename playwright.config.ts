/**
 * Playwright config for Reflect smoke tests (PRD §9.3 reliability — CI gates).
 *
 * Setup (one-time):
 *   npm install --save-dev @playwright/test
 *   npx playwright install --with-deps chromium
 *
 * Run locally:
 *   npm run e2e
 *
 * The webServer block boots `vite preview` on port 4173 before tests; the
 * dist/ build is expected to exist (run `npm run build` first or rely on CI
 * to do it via the e2e:ci script).
 *
 * Tests require these env vars (set via .env or CI secrets):
 *   TEST_USER_EMAIL
 *   TEST_USER_PASSWORD
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // sequential — auth state is shared
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
