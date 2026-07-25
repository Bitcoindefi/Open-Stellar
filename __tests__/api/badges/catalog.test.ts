import { describe, it, expect, beforeEach } from "vitest"
import { GET } from "@/app/api/badges/route"
import { registerAgent, resetAgentRegistryForTests } from "@/lib/agent-registry"
import { upsertReputationMetrics, resetReputationStoreForTests } from "@/lib/reputation/reputation-store"
import { BADGE_CATALOG, getBadgeCatalogEntry, BADGE_RARITY_VALUES } from "@/lib/gamification/badge-catalog"

describe("badge-catalog module", () => {
  it("exports all five rarity tiers in order", () => {
    expect(BADGE_RARITY_VALUES).toEqual(["common", "uncommon", "rare", "epic", "legendary"])
  })

  it("getBadgeCatalogEntry returns entry for known id", () => {
    const entry = getBadgeCatalogEntry("iron-badge-progress")
    expect(entry).toBeDefined()
    expect(entry!.badgeId).toBe("iron-badge-progress")
    expect(entry!.xpValue).toBeGreaterThan(0)
    expect(entry!.rarity).toBe("common")
  })

  it("getBadgeCatalogEntry returns undefined for unknown id", () => {
    expect(getBadgeCatalogEntry("does-not-exist")).toBeUndefined()
  })

  it("catalog has at least 5 entries", () => {
    expect(BADGE_CATALOG.length).toBeGreaterThanOrEqual(5)
  })

  it("all catalog entries have required fields", () => {
    for (const entry of BADGE_CATALOG) {
      expect(entry.badgeId).toBeTruthy()
      expect(entry.name).toBeTruthy()
      expect(entry.description).toBeTruthy()
      expect(BADGE_RARITY_VALUES as readonly string[]).toContain(entry.rarity)
      expect(entry.xpValue).toBeGreaterThan(0)
    }
  })
})

describe("GET /api/badges", () => {
  beforeEach(() => {
    resetAgentRegistryForTests()
    resetReputationStoreForTests()
  })

  it("returns full catalog", async () => {
    const res = await GET(new Request("http://localhost/api/badges"))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
    expect(json.length).toBe(BADGE_CATALOG.length)
    const entry = json[0]
    expect(entry).toHaveProperty("badgeId")
    expect(entry).toHaveProperty("name")
    expect(entry).toHaveProperty("description")
    expect(entry).toHaveProperty("rarity")
    expect(entry).toHaveProperty("xpValue")
    expect(entry).toHaveProperty("earnedByCount")
  })

  it("earnedByCount is 0 when no agents have earned the badge", async () => {
    const res = await GET(new Request("http://localhost/api/badges"))
    const json = await res.json()
    for (const entry of json) {
      expect(entry.earnedByCount).toBe(0)
    }
  })

  it("earnedByCount counts distinct agents with that badge", async () => {
    registerAgent({ agentId: "agent-a", model: "m", district: "defense" as const, capabilities: [], status: "active" as const, endpoint: "http://x", x402: { accepts: false } })
    registerAgent({ agentId: "agent-b", model: "m", district: "defense" as const, capabilities: [], status: "active" as const, endpoint: "http://x", x402: { accepts: false } })
    upsertReputationMetrics("agent-a", {
      badges: [{ id: "first-quest", rarity: "common", awardedAt: "2026-05-01T00:00:00.000Z" }],
    })
    upsertReputationMetrics("agent-b", {
      badges: [{ id: "first-quest", rarity: "common", awardedAt: "2026-05-02T00:00:00.000Z" }],
    })

    const res = await GET(new Request("http://localhost/api/badges"))
    const json = await res.json()
    const fq = json.find((e: { badgeId: string }) => e.badgeId === "first-quest")
    expect(fq).toBeDefined()
    expect(fq.earnedByCount).toBe(2)
  })

  it("earnedByCount counts each agent once even if they have duplicate badge ids", async () => {
    registerAgent({ agentId: "agent-dup", model: "m", district: "defense" as const, capabilities: [], status: "active" as const, endpoint: "http://x", x402: { accepts: false } })
    upsertReputationMetrics("agent-dup", {
      badges: [
        { id: "first-quest", rarity: "common", awardedAt: "2026-05-01T00:00:00.000Z" },
        { id: "first-quest", rarity: "common", awardedAt: "2026-05-03T00:00:00.000Z" },
      ],
    })

    const res = await GET(new Request("http://localhost/api/badges"))
    const json = await res.json()
    const fq = json.find((e: { badgeId: string }) => e.badgeId === "first-quest")
    expect(fq.earnedByCount).toBe(1)
  })

  it("filters catalog by rarity", async () => {
    const res = await GET(new Request("http://localhost/api/badges?rarity=common"))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.length).toBeGreaterThan(0)
    expect(json.every((e: { rarity: string }) => e.rarity === "common")).toBe(true)
  })

  it("returns 400 for invalid rarity", async () => {
    const res = await GET(new Request("http://localhost/api/badges?rarity=mythic"))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.error).toContain("rarity")
    expect(json.error).toContain("mythic")
  })
})
