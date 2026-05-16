/**
 * Smoke test: login flow (PRD §REQ-AUTH-01).
 *
 * Verifies:
 *   - /login renders the form
 *   - bad credentials show inline error (no crash)
 *   - valid credentials redirect to / (Dashboard)
 *
 * Requires TEST_USER_EMAIL + TEST_USER_PASSWORD env vars (set in CI secrets
 * or local .env). If missing, the success path is skipped with a warning.
 */
import { expect, test } from '@playwright/test';

test.describe('Login', () => {
  test('renders the form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Şifrə')).toBeVisible();
    await expect(page.getByRole('button', { name: /daxil ol/i })).toBeVisible();
  });

  test('shows error on bad credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nonexistent@example.com');
    await page.getByLabel('Şifrə').fill('wrong-password-xyz');
    await page.getByRole('button', { name: /daxil ol/i }).click();
    // Generic error per PRD §5 (no enumeration)
    await expect(page.getByText(/yanlışdır/i)).toBeVisible({ timeout: 10_000 });
    // Still on /login
    expect(page.url()).toContain('/login');
  });

  test('success → Dashboard', async ({ page }) => {
    const email = process.env.TEST_USER_EMAIL;
    const password = process.env.TEST_USER_PASSWORD;
    test.skip(!email || !password, 'TEST_USER_EMAIL/PASSWORD not configured');

    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Şifrə').fill(password!);
    await page.getByRole('button', { name: /daxil ol/i }).click();
    // Dashboard mounts the topbar with NotificationBell — wait for it
    await expect(page.getByLabel(/axtarış/i)).toBeVisible({ timeout: 15_000 });
    expect(page.url()).not.toContain('/login');
  });
});
