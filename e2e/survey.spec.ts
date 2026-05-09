import { expect, test } from '@playwright/test';

test.describe('Public retrospective survey', () => {
  test('shows "tapılmadı" for an unknown token', async ({ page }) => {
    await page.goto('/survey/unknown-token-xxx');
    // Either explicit error string or absence of the form's NPS row
    const errorPattern = /tapılmadı|tapılmayan|not found/i;
    await expect.poll(async () => (await page.content()).match(errorPattern) !== null, {
      timeout: 5_000,
    }).toBeTruthy();
  });
});
