import { expect, test } from "@playwright/test";

const adminKey =
  process.env.ADMIN_API_KEY || "osk_admin_live_master_key_1234567890abcdef";

test.describe("admin API keys management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/admin/keys?apiKey=${encodeURIComponent(adminKey)}`);
  });

  test("displays the API key management console", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "API Key Management" }),
    ).toBeVisible();
    await expect(page.getByText("Zero-Trust Hashing")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Create API Key/i }),
    ).toBeVisible();
  });

  test("can create a new service key and view the one-time secret banner", async ({
    page,
  }) => {
    // Open creation modal
    await page.getByRole("button", { name: /Create API Key/i }).click();
    await expect(page.locator("#new-key-name-input")).toBeVisible();

    // Fill form and select scopes
    await page.fill("#new-key-name-input", "e2e-test-key");
    await page.click("text=x402:quote");
    await page.getByRole("button", { name: /Generate Key/i }).click();

    // Verify one-time secret banner appears
    await expect(page.getByText("API Key Generated")).toBeVisible();
    await expect(page.getByText("Save this key immediately")).toBeVisible();
    await expect(page.getByRole("button", { name: /Copy Key/i })).toBeVisible();

    // Dismiss banner
    await page.getByRole("button", { name: /Dismiss/i }).click();
    await expect(page.getByText("Save this key immediately")).not.toBeVisible();

    // Verify key appears in active keys table
    await expect(page.getByText("e2e-test-key")).toBeVisible();
  });
});
