import { expect, test } from '@playwright/test';

// Software WebGL (SwiftShader) so the 3D view can start on CI machines without a GPU.
test.use({
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
});

test.describe('3D city view', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('onboarding-seen', '1');
    });
    await page.goto('/');
  });

  test('is opt-in, remembers the choice and switches back to 2D', async ({ page }) => {
    test.setTimeout(120_000);
    const controls = page.getByRole('group', { name: 'City map controls' });
    await expect(controls.getByRole('button', { name: '2D pixel map' })).toHaveAttribute('aria-pressed', 'true');

    await controls.getByRole('button', { name: '3D city view' }).click();
    await expect(page.getByTestId('city-3d-view').locator('canvas')).toBeVisible({ timeout: 60_000 });
    await expect(controls.getByRole('button', { name: '3D city view' })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.localStorage.getItem('agentic-city:map-view'))).toBe('3d');

    await page.reload();
    await expect(page.getByTestId('city-3d-view')).toBeVisible({ timeout: 60_000 });

    await page.getByRole('group', { name: 'City map controls' }).getByRole('button', { name: '2D pixel map' }).click();
    const cityCanvas = page.getByRole('listbox', { name: 'Agents on city canvas' });
    await expect(cityCanvas.getByRole('option', { name: /Nexus-7/i })).toBeVisible();
    await expect(page.getByTestId('city-3d-view')).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem('agentic-city:map-view'))).toBe('2d');
  });
});
