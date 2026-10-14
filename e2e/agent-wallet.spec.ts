import { expect, test } from '@playwright/test';

test.describe('agent selection and wallet surface', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('onboarding-seen', '1');
      // The 3D city is the default; this flow picks agents on the 2D canvas's keyboard listbox.
      window.localStorage.setItem('agentic-city:map-view', '2d');
    });
    await page.goto('/');
  });

  test('selects an agent from the canvas and keeps the wallet workflow reachable', async ({ page }) => {
    const cityCanvas = page.getByRole('listbox', { name: 'Agents on city canvas' });
    const nexusAgent = cityCanvas.getByRole('option', { name: /Nexus-7/i });

    // Keyboard selection: robots walk, so a neighbour (Vertex-11 shares the district) can sit on top of
    // Nexus-7 at the moment of a pointer click.
    await nexusAgent.focus();
    await nexusAgent.press('Enter');
    await expect(nexusAgent).toHaveAttribute('aria-selected', 'true');

    const walletTab = page.getByRole('button', { name: 'Wallet tab', exact: true });
    await walletTab.click();
    await expect(walletTab).toHaveAttribute('aria-pressed', 'true');

    // Solana-first: the x402 pay-per-task panel is the wallet entry point.
    await expect(page.getByRole('heading', { name: /Pagarle a un agente/i })).toBeVisible();
    await expect(page.getByText(/x402 · Solana devnet/i)).toBeVisible();
    // CI browsers have no wallet extension, so the panel offers an install link or the wallets it found.
    await expect(
      page.getByText(/No encontramos una wallet de Solana compatible|Conectar /i).first(),
    ).toBeVisible();

    const stellarEnabled = /^(1|true|yes|on)$/i.test(process.env.NEXT_PUBLIC_ENABLE_STELLAR?.trim() ?? '');
    const freighter = page.getByText(/Checking Freighter wallet|Freighter Not Detected|Freighter detected|Connect Freighter Wallet|Get Freighter/i).first();
    if (stellarEnabled) {
      await expect(freighter).toBeVisible();
    } else {
      await expect(freighter).toHaveCount(0);
    }
  });
});
