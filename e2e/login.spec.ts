import { expect, test } from '@playwright/test';

test.describe('Login surface', () => {
  test('renders the login form + Reflect wordmark', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login$/);
    // Wordmark appears on the auth chrome
    await expect(page.getByText('Reflect', { exact: true }).first()).toBeVisible();
    // Email + password inputs present
    await expect(page.getByRole('textbox', { name: /e-?poç?t|email/i }).first())
      .toBeVisible();
  });

  test('redirects unauthenticated visits to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});
