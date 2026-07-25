import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createWebhookRegistration,
  getWebhookById,
  resetWebhookStoreForTests,
  setWebhookStorePathForTests,
  resetWebhookStorePathForTests,
} from "../store"

let testDir: string

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "webhook-store-test-"))
  setWebhookStorePathForTests(join(testDir, "webhooks.json"))
})

afterEach(() => {
  resetWebhookStoreForTests()
  resetWebhookStorePathForTests()
  rmSync(testDir, { recursive: true, force: true })
})

describe("getWebhookById", () => {
  it("returns null for unknown webhook", () => {
    const webhook = getWebhookById("wh_nonexistent")
    expect(webhook).toBeNull()
  })

  it("returns the webhook registration for a known id", () => {
    const created = createWebhookRegistration({
      url: "https://example.com/hook",
      events: ["agent.status"],
    })

    const found = getWebhookById(created.id)
    expect(found).not.toBeNull()
    expect(found?.id).toBe(created.id)
    expect(found?.url).toBe("https://example.com/hook")
    expect(found?.events).toEqual(["agent.status"])
    expect(found?.secret).toBe(created.secret)
  })

  it("trims whitespace from the id", () => {
    const created = createWebhookRegistration({
      url: "https://example.com/hook",
      events: ["agent.status"],
    })

    const found = getWebhookById(`  ${created.id}  `)
    expect(found).not.toBeNull()
    expect(found?.id).toBe(created.id)
  })
})