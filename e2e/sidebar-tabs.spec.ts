import { expect, test } from '@playwright/test';

test.describe('sidebar tab persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('onboarding-seen', '1');
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const showSidebar = page.getByRole('button', { name: 'Show sidebar' });
    if (await showSidebar.isVisible()) {
      await showSidebar.click();
    }
  });

  const tabButton = (page: Parameters<Parameters<typeof test>[2]>[0]['page'], tab: string) =>
    page.getByRole('button', { name: `${tab} tab`, exact: true });

  test('shows all desktop sidebar tabs', async ({ page }) => {
    const tabs = ['Overview', 'Modelos IA', 'Complementos', 'Chat', 'Offers', 'Skills', 'Quests', 'Wallet', 'Appearance'];

    for (const tab of tabs) {
      await expect(tabButton(page, tab)).toBeVisible();
    }
  });

  test('defaults to the Overview tab', async ({ page }) => {
    const overviewTab = tabButton(page, 'Overview');

    await expect(overviewTab).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('City Overview')).toBeVisible();
  });

  test('switches tabs and updates active state', async ({ page }) => {
    await tabButton(page, 'Chat').click();
    await expect(tabButton(page, 'Chat')).toHaveAttribute('aria-pressed', 'true');

    await tabButton(page, 'Skills').click();
    await expect(tabButton(page, 'Skills')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.evaluate(() => localStorage.getItem('sidebar-tab'))).resolves.toBe('skills');
  });

  test('persists the selected tab after reload', async ({ page }) => {
    await tabButton(page, 'Wallet').click();
    await expect(tabButton(page, 'Wallet')).toHaveAttribute('aria-pressed', 'true');

    await page.reload();

    await expect(tabButton(page, 'Wallet')).toHaveAttribute('aria-pressed', 'true');
  });

  test('stores each tab selection in localStorage', async ({ page }) => {
    const tabs = [
      ['Chat', 'chat'],
      ['Modelos IA', 'models'],
      ['Complementos', 'connectors'],
      ['Offers', 'offers'],
      ['Skills', 'skills'],
      ['Quests', 'quests'],
      ['Wallet', 'wallet'],
    ] as const;

    for (const [label, storedValue] of tabs) {
      await tabButton(page, label).click();
      await expect(page.evaluate(() => localStorage.getItem('sidebar-tab'))).resolves.toBe(storedValue);
    }
  });
});
