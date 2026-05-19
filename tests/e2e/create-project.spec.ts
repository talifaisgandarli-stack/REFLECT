/**
 * Smoke test: create project via Projects page.
 * Verifies: navigate to /layihelər → "+ Yeni layihə" → fill → card appears.
 */
import { expect, test } from '@playwright/test';

test.describe('Create project', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_USER_EMAIL;
    const password = process.env.TEST_USER_PASSWORD;
    test.skip(!email || !password, 'TEST_USER_EMAIL/PASSWORD not configured');
    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Şifrə').fill(password!);
    await page.getByRole('button', { name: /daxil ol/i }).click();
    await expect(page.getByLabel(/axtarış/i)).toBeVisible({ timeout: 15_000 });
  });

  test('admin can create a project', async ({ page }) => {
    await page.goto('/layihelər');
    const cta = page.getByRole('button', { name: /yeni layihə/i }).first();
    test.skip(!(await cta.isVisible({ timeout: 5_000 }).catch(() => false)), 'Non-admin test user');
    await cta.click();

    const stamp = Date.now();
    const name = `E2E project ${stamp}`;
    await page.getByPlaceholder(/ad|name/i).first().fill(name);
    // Phases are pre-selected to defaults; submit immediately
    await page.getByRole('button', { name: /yarat|saxla|təsdiqlə/i }).first().click();

    // Toast or new card
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
  });
});
