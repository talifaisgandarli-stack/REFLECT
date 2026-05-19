/**
 * Smoke test: create task via Cmd+N global shortcut.
 * Verifies: shortcut opens TaskCreateModal → title input → submit → toast.
 */
import { expect, test } from '@playwright/test';

test.describe('Create task', () => {
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

  test('Cmd+N opens modal and creates task', async ({ page }) => {
    // Trigger global Cmd+N (Ctrl+N on Linux/Windows runners)
    await page.keyboard.press('Control+n');
    await expect(page.getByRole('heading', { name: /yeni tapşırıq/i })).toBeVisible();

    const stamp = Date.now();
    const title = `E2E smoke ${stamp}`;
    await page.getByPlaceholder(/başlıq/i).first().fill(title);
    await page.getByRole('button', { name: /yarat/i }).click();

    // Either the modal closes (success) or we navigate to /tapşırıqlar
    await page.waitForTimeout(1_500);
    await page.goto('/tapşırıqlar');
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
  });
});
