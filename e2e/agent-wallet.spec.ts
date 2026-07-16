import { expect, test } from '@playwright/test';

test.describe('agent selection and wallet surface', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('onboarding-seen', '1');
    });
    await page.goto('/');
  });

  test('selects an agent from the canvas and keeps the wallet workflow reachable', async ({ page }) => {
    const cityCanvas = page.getByRole('listbox', { name: 'Agents on city canvas' });
    const nexusAgent = cityCanvas.getByRole('option', { name: /Nexus-7/i });

    await nexusAgent.click();
    await expect(nexusAgent).toHaveAttribute('aria-selected', 'true');

    const walletTab = page.getByRole('button', { name: 'Wallet tab', exact: true });
    await walletTab.click();
    await expect(walletTab).toHaveAttribute('aria-pressed', 'true');

    await expect(
      page.getByText(/Checking Freighter wallet|Freighter Not Detected|Freighter detected|Connect Freighter Wallet|Get Freighter/i).first(),
    ).toBeVisible();
  });
});
