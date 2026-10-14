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
  });

  test('is the default view, remembers a switch to 2D and switches back', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    const view3d = page.getByTestId('city-3d-view');
    await expect(view3d.locator('canvas')).toBeVisible({ timeout: 60_000 });
    const controls = page.getByRole('group', { name: 'City map controls' });
    await expect(controls.getByRole('button', { name: '3D city view' })).toHaveAttribute('aria-pressed', 'true');
    // Nothing is saved until the user picks a view.
    expect(await page.evaluate(() => window.localStorage.getItem('agentic-city:map-view'))).toBeNull();
    await expect(view3d.locator('[data-district-label]')).toHaveCount(5);

    await controls.getByRole('button', { name: '2D pixel map' }).click();
    const cityCanvas = page.getByRole('listbox', { name: 'Agents on city canvas' });
    await expect(cityCanvas.getByRole('option', { name: /Nexus-7/i })).toBeVisible();
    await expect(view3d).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem('agentic-city:map-view'))).toBe('2d');

    // The saved 2D choice wins over the 3D default.
    await page.reload();
    await expect(page.getByRole('listbox', { name: 'Agents on city canvas' }).getByRole('option', { name: /Nexus-7/i })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('city-3d-view')).toHaveCount(0);

    await page.getByRole('group', { name: 'City map controls' }).getByRole('button', { name: '3D city view' }).click();
    await expect(page.getByTestId('city-3d-view').locator('canvas')).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => window.localStorage.getItem('agentic-city:map-view'))).toBe('3d');
  });

  test('falls back to 2D when the 3D chunk fails to load, without saving 2D as the choice', async ({ page }) => {
    test.setTimeout(120_000);
    // Fail the lazy 3D chunk(s) the way a network blip or a stale chunk after a deploy would.
    // Dev chunks are named after the module; production chunks are matched by content.
    await page.route('**/_next/static/chunks/**', async (route) => {
      const url = route.request().url();
      if (/city3d|city-3d/.test(url)) return route.abort('failed');
      const response = await route.fetch();
      const body = await response.text();
      if (/"data-testid":\s*"city-3d-view"/.test(body)) return route.abort('failed');
      return route.fulfill({ response, body });
    });
    await page.goto('/');

    const cityCanvas = page.getByRole('listbox', { name: 'Agents on city canvas' });
    await expect(cityCanvas.getByRole('option', { name: /Nexus-7/i })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('city-3d-view')).toHaveCount(0);
    const stored = await page.evaluate(() => ({
      choice: window.localStorage.getItem('agentic-city:map-view'),
      failedAt: window.localStorage.getItem('agentic-city:3d-failed'),
    }));
    // The user's choice stays empty, so the 3D default comes back once the failure flag expires.
    expect(stored.choice).toBeNull();
    expect(Number(stored.failedAt)).toBeGreaterThan(0);
  });

  for (const { width, height } of [{ width: 390, height: 844 }, { width: 360, height: 780 }]) {
    test(`fits every district on a ${width}x${height} phone and keeps the overlays compact`, async ({ browser }) => {
      test.setTimeout(120_000);
      const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
      await context.addInitScript(() => {
        window.localStorage.setItem('onboarding-seen', '1');
      });
      const page = await context.newPage();
      await page.goto('/');
      const view3d = page.getByTestId('city-3d-view');
      await expect(view3d.locator('canvas')).toBeVisible({ timeout: 60_000 });
      const labels = view3d.locator('[data-district-label]');
      await expect(labels).toHaveCount(5);

      // The camera settles after the overlays are measured; then every plate is inside the map,
      // between the top overlays and the bottom nav.
      await expect
        .poll(async () => {
          const nav = await page.getByRole('navigation', { name: 'Agent controls' }).boundingBox();
          const bottom = nav ? nav.y : height;
          const boxes = await labels.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
          return boxes.every((b) => b.left >= 0 && b.right <= width && b.top >= 100 && b.bottom <= bottom);
        }, { timeout: 30_000 })
        .toBe(true);

      // Robot name tags shrink to dots on a phone so they do not cover the plates or each other.
      const robotTags = view3d.locator('[data-agent-label]');
      await expect.poll(() => robotTags.count(), { timeout: 30_000 }).toBeGreaterThan(0);
      expect(await view3d.locator('[data-agent-label]:not([data-compact])[data-emphasized="false"]').count()).toBe(0);

      // The challenge card starts as a small pill and opens on tap.
      const challenge = page.getByRole('button', { name: /District challenge:/ });
      if (await challenge.count()) {
        const pill = await challenge.boundingBox();
        expect(pill!.width).toBeLessThan(160);
        await challenge.click();
        await expect(page.getByRole('region', { name: 'Active district competition' }).getByRole('link').first()).toBeVisible();
      }
      await context.close();
    });
  }
});
