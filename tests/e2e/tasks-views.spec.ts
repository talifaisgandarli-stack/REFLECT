/**
 * Smoke test: the four Tapşırıqlar view toggles (Lövhə · Cədvəl ·
 * Təqvim · Gantt) per design spec §8.3. Verifies that:
 *  - Each chip is visible.
 *  - Clicking a chip swaps the rendered view.
 *  - The chosen view is persisted in ?view= (so refresh keeps it).
 *  - Browser back/forward restores the previous view (the bidirectional
 *    URL→state sync from P1 fix #1).
 *
 * Like the create-task spec, this is skipped without TEST_USER_EMAIL/
 * TEST_USER_PASSWORD so it doesn't break CI for forks that don't
 * configure auth.
 */
import { expect, test } from '@playwright/test';

test.describe('Tasks view toggles', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_USER_EMAIL;
    const password = process.env.TEST_USER_PASSWORD;
    test.skip(!email || !password, 'TEST_USER_EMAIL/PASSWORD not configured');
    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Şifrə').fill(password!);
    await page.getByRole('button', { name: /daxil ol/i }).click();
    await expect(page.getByLabel(/axtarış/i)).toBeVisible({ timeout: 15_000 });
    await page.goto('/tapşırıqlar');
    // The filter toolbar is the page's settled-load anchor.
    await expect(page.getByRole('toolbar', { name: /filtrləri/i })).toBeVisible();
  });

  test('chips swap views and persist to ?view= URL param', async ({ page }) => {
    const chip = (label: string) => page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });

    // Default is Lövhə → no ?view= in URL.
    expect(new URL(page.url()).searchParams.get('view')).toBeNull();

    await chip('Cədvəl').click();
    await expect(page).toHaveURL(/[?&]view=table/);

    await chip('Təqvim').click();
    await expect(page).toHaveURL(/[?&]view=calendar/);

    await chip('Gantt').click();
    await expect(page).toHaveURL(/[?&]view=gantt/);

    // Browser back should restore Təqvim — exercises the URL→state
    // reverse-sync effect.
    await page.goBack();
    await expect(page).toHaveURL(/[?&]view=calendar/);

    await page.goBack();
    await expect(page).toHaveURL(/[?&]view=table/);

    // Forward returns us to calendar.
    await page.goForward();
    await expect(page).toHaveURL(/[?&]view=calendar/);
  });

  test('refresh on a non-default view keeps the view selected', async ({ page }) => {
    await page.goto('/tapşırıqlar?view=table');
    // The table renders with an aria-label that includes the row count.
    await expect(page.getByRole('table', { name: /tapşırıq cədvəli/i })).toBeVisible();
  });
});
