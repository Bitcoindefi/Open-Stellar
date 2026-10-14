import { expect, test } from '@playwright/test';

test.describe('onboarding modal', () => {
  test.beforeEach(async ({ page }) => {
    // A first visit: clear storage on the first load only, so a reload keeps what the page saved.
    await page.addInitScript(() => {
      if (window.sessionStorage.getItem('e2e-storage-cleared')) return;
      window.localStorage.clear();
      window.sessionStorage.setItem('e2e-storage-cleared', '1');
    });
  });

  test('shows the first-visit tour with the expected first step', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Step 1 of 3')).toBeVisible();
    await expect(page.getByText('Every robot is an AI agent.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
  });

  test('steps through all onboarding panels', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Step 1 of 3')).toBeVisible();

    const nextButton = page.getByRole('button', { name: 'Next', exact: true });
    await nextButton.click();

    await expect(page.locator('text=You keep control')).toBeVisible();
    await expect(page.getByText("Fund the agents' wallet once", { exact: false })).toBeVisible();
    await nextButton.click();

    await expect(page.locator('text=Bring Your Own AI')).toBeVisible();
    await expect(page.getByText('Open Modelos IA to connect your models', { exact: false })).toBeVisible();
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
