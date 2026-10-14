import { expect, test, type Page } from '@playwright/test';

// "Red de pago: Solana | Arc". Only meaningful when the dev server runs with
// NEXT_PUBLIC_ENABLE_ARC=true (the flag is inlined at build time); skipped otherwise.
// The network is mocked: no wallet, chain or facilitator is touched.

const arcEnabled = /^(1|true|yes|on)$/i.test(process.env.NEXT_PUBLIC_ENABLE_ARC?.trim() ?? '');
const SHOTS = process.env.E2E_SCREENSHOT_DIR;
const ARC_ADDRESS = '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF';
const TX = '0x9c5da2f5a1338bcd3fd5673beb22e1ef8f62690185cfb3196712a66128d5df3b';

async function mockArc(page: Page) {
  await page.route((url) => url.pathname === '/api/agent-wallet' && url.searchParams.get('network') === 'arc', (route) => route.fulfill({
    json: {
      ok: true, network: 'eip155:5042002', chainId: 5042002, address: ARC_ADDRESS, created: false,
      asset: '0x3600000000000000000000000000000000000000', balanceMicro: '250000', balanceUsdc: '0.25',
      fundUsdc: '0.1', hirePriceUsdc: '0.01', caps: { perRunUsdc: '0.03', perDayUsdc: '0.5' }, spentTodayUsdc: '0.01',
      gasReserveUsdc: '0.01', withdrawAvailable: true, faucetUrl: 'https://faucet.circle.com',
      explorerUrl: `https://explorer.testnet.arc.io/address/${ARC_ADDRESS}`,
    },
  }));
}

test.describe('payment network selector (Arc flag on)', () => {
  test.skip(!arcEnabled, 'needs NEXT_PUBLIC_ENABLE_ARC=true on the dev server');

  test.beforeEach(async ({ page }) => {
    // The dev server compiles the lazy wallet chunks on first use.
    test.setTimeout(150_000);
    await page.addInitScript(() => window.localStorage.setItem('onboarding-seen', '1'));
    await mockArc(page);
  });

  test('switches the Wallet tab between Solana and Arc and remembers the choice', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Wallet tab', exact: true }).click();

    const selector = page.getByRole('radiogroup', { name: 'Red de pago' });
    const solana = selector.getByRole('radio', { name: 'Solana' });
    const arc = selector.getByRole('radio', { name: 'Arc' });
    await expect(solana).toHaveAttribute('aria-checked', 'true', { timeout: 45_000 });
    await expect(page.getByText(/x402 · Solana devnet/i)).toBeVisible({ timeout: 45_000 });

    await arc.click();
    await expect(arc).toHaveAttribute('aria-checked', 'true');
    // The Arc panel is a lazy chunk: the dev server may compile it on first use.
    await expect(page.getByText('Sin login · Arc testnet')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('arc-wallet-balance')).toHaveText(/^0[.,]25 USDC$/);
    await expect(page.getByText(/faucet\.circle\.com/)).toBeVisible();
    // The Solana-only pay-per-task panel is not shown on Arc.
    await expect(page.getByText(/x402 · Solana devnet/i)).toHaveCount(0);
    if (SHOTS) await page.getByRole('region', { name: 'Wallet de tus agentes en Arc' }).screenshot({ path: `${SHOTS}/arc-wallet-selector.png` });

    await page.reload();
    await page.getByRole('button', { name: 'Wallet tab', exact: true }).click();
    await expect(page.getByRole('radiogroup', { name: 'Red de pago' }).getByRole('radio', { name: 'Arc' })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('radiogroup', { name: 'Red de pago' }).getByRole('radio', { name: 'Solana' }).click();
    await expect(page.getByText(/x402 · Solana devnet/i)).toBeVisible();
  });

  test('filters /explorer by network and links Arc receipts to the Arc explorer', async ({ page }) => {
    const arcReceipt = { id: `payment:${TX}`, type: 'payment', tx: TX, network: 'arc-testnet', amount: '10000', asset: 'USDC', agentId: 'nexus-7', agentName: 'Nexus-7', counterpartId: null, counterpartName: null, payer: '0x459E…a451', identity: null, score: null, timestamp: Date.now() - 60_000, source: 'app' };
    const requested: string[] = [];
    await page.route((url) => url.pathname === '/api/receipts', (route) => {
      const url = new URL(route.request().url());
      requested.push(url.searchParams.get('network') ?? 'all');
      return route.fulfill({ json: {
        ok: true, network: url.searchParams.get('network') ?? 'all', receipts: [arcReceipt], page: 1, totalPages: 1, total: 1,
        totals: { payments: 1, volumeUsdc: 0.01, hires: 0, reviews: 0, registrations: 0, uniquePayers: 1 },
        agents: [{ id: 'nexus-7', name: 'Nexus-7' }], sources: { app: 1, onchain: 0, onchainPending: 0, onchainError: false, logError: false }, updatedAt: new Date().toISOString(),
      } });
    });
    await page.goto('/explorer');
    const networks = page.getByRole('group', { name: 'Red' });
    // Wait for the first load (the page is hydrated once it has data), then filter.
    await expect(page.getByText('Pago por una tarea de')).toBeVisible({ timeout: 45_000 });
    await expect(async () => {
      await networks.getByRole('button', { name: 'Arc testnet' }).click();
      await expect(networks.getByRole('button', { name: 'Arc testnet' })).toHaveAttribute('aria-pressed', 'true', { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect.poll(() => requested.at(-1)).toBe('arc');
    await expect(page).toHaveURL(/network=arc/);
    const link = page.getByRole('link', { name: new RegExp(`Ver la transacción ${TX} en Arc Explorer`) });
    await expect(link).toHaveAttribute('href', `https://explorer.testnet.arc.io/tx/${TX}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/arc-explorer-filter.png`, fullPage: false });
  });
});
