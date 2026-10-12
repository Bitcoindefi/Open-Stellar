import { expect, test } from '@playwright/test';

// A browser without WebGL: the 3D view must never start and the 2D map keeps working.
test.use({ launchOptions: { args: ['--disable-webgl', '--disable-3d-apis'] } });

test('falls back to the 2D map with a notice when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('onboarding-seen', '1');
    // A 3D choice saved on another device or before WebGL was turned off.
    window.localStorage.setItem('agentic-city:map-view', '3d');
  });
  await page.goto('/');

  await expect(page.getByText(/3D view needs WebGL/i)).toBeVisible();
  await expect(page.getByTestId('city-3d-view')).toHaveCount(0);
  const cityCanvas = page.getByRole('listbox', { name: 'Agents on city canvas' });
  await expect(cityCanvas.getByRole('option', { name: /Nexus-7/i })).toBeVisible();

  const controls = page.getByRole('group', { name: 'City map controls' });
  await controls.getByRole('button', { name: '3D city view' }).click();
  await expect(controls.getByRole('button', { name: '2D pixel map' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('city-3d-view')).toHaveCount(0);
});
