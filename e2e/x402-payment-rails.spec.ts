import { expect, test } from "@playwright/test";

test.describe("x402 Payment Rails E2E Flow", () => {
  test("browses marketplace services and tests x402 quote/settle gate", async ({ page }) => {
    await page.goto("/marketplace");

    // Check page header and marketplace services catalog
    await expect(page.locator("h1")).toContainText("Discover agent services");
    await expect(page.getByText("x402 service marketplace")).toBeVisible();

    // Open Test x402 Gate modal on the first service card
    const testGateButton = page.getByRole("button", { name: "Test x402 Gate" }).first();
    await testGateButton.click();

    // Verify modal elements
    await expect(page.getByText("Live x402 Payment Gate Test")).toBeVisible();
    await expect(page.getByText(/Quote ID:/i)).toBeVisible({ timeout: 10000 });

    // Settle the quote
    const settleButton = page.getByRole("button", { name: /Settle Payment on STELLAR/i });
    await settleButton.click();

    // Verify settlement success
    await expect(page.getByText("Settlement Accepted!")).toBeVisible();
  });

  test("views payment explorer receipts and filter options", async ({ page }) => {
    await page.goto("/explorer");

    await expect(page.locator("h1")).toContainText("Payment Explorer");
    await expect(page.getByText("x402 transparency")).toBeVisible();
    await expect(page.getByPlaceholder("Search receipts, agents, services, or hashes")).toBeVisible();
  });
});
