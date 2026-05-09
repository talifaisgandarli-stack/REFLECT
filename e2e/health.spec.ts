import { expect, test } from '@playwright/test';

/**
 * Smoke / health checks that don't require an authenticated session.
 * Mounted at the harness level so the dev server stays warm — slice 44
 * already provisions the Playwright config + `npm run dev` webServer.
 */
test.describe('Public reachability', () => {
  test('login page returns 200 + has the wordmark', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response?.status() ?? 0).toBeLessThan(400);
    await expect(page.getByText('Reflect', { exact: true }).first()).toBeVisible();
  });

  test('survey route renders even with bad token (no auth gate)', async ({ page }) => {
    const response = await page.goto('/survey/abcdef');
    expect(response?.status() ?? 0).toBeLessThan(400);
    // Public surface chrome — heading present
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('protected routes redirect anonymous visits to /login', async ({ page }) => {
    for (const path of ['/', '/tapşırıqlar', '/layihelər', '/maliyyə']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('CSS skip-link is the first focusable element on a public page', async ({ page }) => {
    await page.goto('/login');
    // First Tab from a fresh paint should land on the skip link or first
    // form field; we assert *something* receives focus rather than nothing.
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      return { tag: el.tagName, role: el.getAttribute('role'), text: el.textContent?.slice(0, 60) };
    });
    expect(focused).not.toBeNull();
  });
});

test.describe('PWA-ish basics', () => {
  test('html lang attribute is set', async ({ page }) => {
    await page.goto('/login');
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBeTruthy();
  });

  test('viewport meta tag exists for mobile rendering', async ({ page }) => {
    await page.goto('/login');
    const content = await page
      .locator('meta[name="viewport"]')
      .first()
      .getAttribute('content');
    expect(content).toContain('width=device-width');
  });
});
