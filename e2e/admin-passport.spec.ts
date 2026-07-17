import { expect, test } from '@playwright/test';

test.describe('admin passport flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin');
  });

  test('opens the passport tab with mint, verification, payment, and replay controls', async ({ page }) => {
    await page.getByRole('button', { name: /Agent Passport/i }).click();

    await expect(page.getByText('Zero-knowledge trust layer')).toBeVisible();
    await expect(page.getByText('Mint passport')).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate proof/i })).toBeVisible();

    await expect(page.getByText('Simulate on-chain verification')).toBeVisible();
    await expect(page.getByRole('button', { name: /Simulate verification/i })).toBeDisabled();

    await expect(page.getByText('Authorize x402 payment')).toBeVisible();
    await expect(page.getByRole('button', { name: /Request payment/i })).toBeDisabled();

    await expect(page.getByText('Replay attack')).toBeVisible();
    await expect(page.getByRole('button', { name: /Replay spent proof/i })).toBeVisible();
    await expect(page.getByText('Passport collection')).toBeVisible();
  });
});
