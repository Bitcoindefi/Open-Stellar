import { expect, test } from '@playwright/test';

test.describe('onboarding modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
  });

  test('shows the first-visit tour with the expected first step', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Step 1 of 3')).toBeVisible();
    await expect(page.getByText('The city starts with a simulated roster.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
  });

  test('steps through all onboarding panels', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Step 1 of 3')).toBeVisible();

    const nextButton = page.getByRole('button', { name: 'Next', exact: true });
    await nextButton.click();

    await expect(page.locator('text=Sidebar Controls')).toBeVisible();
    await expect(page.getByText('The sidebar has tabs for AI models', { exact: false })).toBeVisible();
    await nextButton.click();

    await expect(page.locator('text=Bring Your Own AI')).toBeVisible();
    await expect(page.getByText('Open Modelos IA or Complementos', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /get started/i })).toBeVisible();
  });

  test('persists completion after Get started', async ({ page }) => {
    await page.goto('/');

    const nextButton = page.getByRole('button', { name: 'Next', exact: true });
    await nextButton.click();
    await nextButton.click();

    await page.getByRole('button', { name: /get started/i }).click();

    await expect(page.getByText('Step 1 of 3')).not.toBeVisible();
    await expect(page.evaluate(() => localStorage.getItem('onboarding-seen'))).resolves.toBe('1');

    await page.reload();
    await expect(page.getByText('Step 1 of 3')).not.toBeVisible();
  });

  test('allows skipping the tour', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /skip/i }).click();

    await expect(page.getByText('Step 1 of 3')).not.toBeVisible();
    await expect(page.evaluate(() => localStorage.getItem('onboarding-seen'))).resolves.toBe('1');
  });
});
