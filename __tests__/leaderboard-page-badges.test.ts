/**
 * Integration tests for the LeaderboardPage server-render badge hydration path.
 *
 * Validates that `listLeaderboardAgents(..., hydrateBadges=true)` – the call
 * made by the page server component at SSR time – resolves structured
 * `badgeIcons` for every agent **in parallel** (no HTTP waterfall: it reads
 * directly from the reputation store, same as the API route).
 *
 * Acceptance criteria covered:
 *   - badgeIcons present in initial SSR payload (global view)
 *   - badgeIcons present in district view (per-district leaderboard)
 *   - badgeIcons sorted most-recent first per agent
 *   - "+N more" overflow data is correct (component receives all badges)
 *   - Agents with no badges get an empty array, not undefined
 *   - resolveBadgesForAgent is idempotent with the API route output
 */
import { describe, it, expect, beforeEach } from "vitest"
import {
  listLeaderboardAgents,
  resolveBadgesForAgent,
  getLeaderboardAgent,
} from "@/lib/leaderboard"
import {
  upsertReputationMetrics,
  resetReputationStoreForTests,
} from "@/lib/reputation/reputation-store"

beforeEach(() => {
  resetReputationStoreForTests()
})

describe("LeaderboardPage server render – parallel badge hydration", () => {
  describe("listLeaderboardAgents with hydrateBadges=true (global view)", () => {
    it("returns populated badgeIcons for an agent that has reputation badges", () => {
      upsertReputationMetrics("bot-0", {
        badges: [
          { id: "zk-certified", rarity: "epic", awardedAt: "2026-06-20T00:00:00.000Z" },
          { id: "first-quest", rarity: "common", awardedAt: "2026-05-01T00:00:00.000Z" },
        ],
      })

      const agents = listLeaderboardAgents("global", undefined, true)
      const bot0 = agents.find((a) => a.id === "bot-0")
      expect(bot0).toBeDefined()
      expect(bot0!.badgeIcons).toHaveLength(2)
      // Most-recent first
      expect(bot0!.badgeIcons[0].id).toBe("zk-certified")
      expect(bot0!.badgeIcons[0].rarity).toBe("epic")
      expect(bot0!.badgeIcons[0].name).toBe("ZK Certified")
      expect(bot0!.badgeIcons[1].id).toBe("first-quest")
      expect(bot0!.badgeIcons[1].rarity).toBe("common")
    })

    it("resolves badges for multiple agents in the same call (no waterfall)", () => {
      const seeds = [
        ["bot-0", "zk-certified", "epic", "2026-06-20T00:00:00.000Z"],
        ["bot-1", "rare-taskmaster", "rare", "2026-06-15T00:00:00.000Z"],
        ["bot-2", "first-quest", "common", "2026-05-01T00:00:00.000Z"],
      ] as const

      for (const [id, badgeId, rarity, awardedAt] of seeds) {
        upsertReputationMetrics(id, {
          badges: [{ id: badgeId, rarity, awardedAt }],
        })
      }

      const agents = listLeaderboardAgents("global", undefined, true)

      for (const [agentId, badgeId] of seeds) {
        const agent = agents.find((a) => a.id === agentId)
        expect(agent).toBeDefined()
        const badge = agent!.badgeIcons.find((b) => b.id === badgeId)
        expect(badge).toBeDefined()
        expect(badge!.id).toBe(badgeId)
      }
    })

    it("returns empty badgeIcons array (not undefined) for agents with no badges", () => {
      const agents = listLeaderboardAgents("global", undefined, true)
      for (const agent of agents) {
        expect(Array.isArray(agent.badgeIcons)).toBe(true)
      }
    })

    it("does NOT hydrate badgeIcons when hydrateBadges=false (default)", () => {
      upsertReputationMetrics("bot-0", {
        badges: [{ id: "zk-certified", rarity: "epic", awardedAt: "2026-06-20T00:00:00.000Z" }],
      })
      // default – no hydration flag
      const agents = listLeaderboardAgents("global")
      const bot0 = agents.find((a) => a.id === "bot-0")
      expect(bot0!.badgeIcons).toHaveLength(0)
    })

    it("exposes more than 3 badges so the component can render +N overflow", () => {
      upsertReputationMetrics("bot-0", {
        badges: [
          { id: "zk-certified", rarity: "epic", awardedAt: "2026-06-20T00:00:00.000Z" },
          { id: "rare-taskmaster", rarity: "rare", awardedAt: "2026-06-15T00:00:00.000Z" },
          { id: "first-quest", rarity: "common", awardedAt: "2026-05-01T00:00:00.000Z" },
          { id: "district-contender", rarity: "uncommon", awardedAt: "2026-04-01T00:00:00.000Z" },
        ],
      })

      const agents = listLeaderboardAgents("global", undefined, true)
      const bot0 = agents.find((a) => a.id === "bot-0")!
      // All 4 badges sent to the component; the component itself caps at 3 visible
      expect(bot0.badgeIcons).toHaveLength(4)
      // Overflow count the component would compute: 4 - 3 = 1 → "+1 more"
      const overflow = bot0.badgeIcons.length - 3
      expect(overflow).toBe(1)
    })

    it("badge name falls back to badgeId for unknown catalog entries", () => {
      upsertReputationMetrics("bot-0", {
        badges: [{ id: "mystery-badge-xyz", rarity: "common", awardedAt: "2026-06-01T00:00:00.000Z" }],
      })
      const agents = listLeaderboardAgents("global", undefined, true)
      const bot0 = agents.find((a) => a.id === "bot-0")!
      expect(bot0.badgeIcons[0].name).toBe("mystery-badge-xyz")
    })
  })

  describe("district view – per-district leaderboard badge hydration", () => {
    it("hydrates badgeIcons for agents in a specific district", () => {
      // bot-0 is in data-center
      upsertReputationMetrics("bot-0", {
        badges: [
          { id: "district-contender", rarity: "uncommon", awardedAt: "2026-06-01T00:00:00.000Z" },
        ],
      })

      const agents = listLeaderboardAgents("district", "data-center", true)
      for (const agent of agents) {
        expect(agent.district).toBe("data-center")
        expect(Array.isArray(agent.badgeIcons)).toBe(true)
      }

      const bot0 = agents.find((a) => a.id === "bot-0")
      if (bot0) {
        const badge = bot0.badgeIcons.find((b) => b.id === "district-contender")
        expect(badge).toBeDefined()
        expect(badge!.name).toBe("District Contender")
        expect(badge!.rarity).toBe("uncommon")
      }
    })

    it("hydrates badgeIcons for week view", () => {
      upsertReputationMetrics("bot-1", {
        badges: [{ id: "rare-taskmaster", rarity: "rare", awardedAt: "2026-06-15T00:00:00.000Z" }],
      })
      const agents = listLeaderboardAgents("week", undefined, true)
      expect(agents.length).toBeGreaterThan(0)
      for (const agent of agents) {
        expect(Array.isArray(agent.badgeIcons)).toBe(true)
      }
      const bot1 = agents.find((a) => a.id === "bot-1")
      if (bot1) {
        expect(bot1.badgeIcons.find((b) => b.id === "rare-taskmaster")).toBeDefined()
      }
    })
  })

  describe("getLeaderboardAgent – per-agent detail page hydration", () => {
    it("returns hydrated badgeIcons for a known agent", () => {
      upsertReputationMetrics("bot-0", {
        badges: [
          { id: "zk-certified", rarity: "epic", awardedAt: "2026-06-20T00:00:00.000Z" },
          { id: "first-quest", rarity: "common", awardedAt: "2026-05-01T00:00:00.000Z" },
        ],
      })
      const agent = getLeaderboardAgent("bot-0")
      expect(agent).toBeDefined()
      expect(agent!.badgeIcons).toHaveLength(2)
      expect(agent!.badgeIcons[0].id).toBe("zk-certified")
    })

    it("returns empty badgeIcons for an agent with no reputation record", () => {
      const agent = getLeaderboardAgent("bot-3")
      expect(agent).toBeDefined()
      expect(Array.isArray(agent!.badgeIcons)).toBe(true)
    })

    it("returns undefined for an unknown agentId", () => {
      expect(getLeaderboardAgent("does-not-exist")).toBeUndefined()
    })
  })

  describe("resolveBadgesForAgent – shared resolver parity with API route", () => {
    it("returns the same badge shape as the API route uses", () => {
      upsertReputationMetrics("bot-0", {
        badges: [
          { id: "zk-certified", rarity: "epic", awardedAt: "2026-06-20T00:00:00.000Z" },
        ],
      })

      const badges = resolveBadgesForAgent("bot-0")
      expect(badges).toHaveLength(1)
      expect(badges[0]).toMatchObject({
        id: "zk-certified",
        name: "ZK Certified",
        rarity: "epic",
        earnedAt: "2026-06-20T00:00:00.000Z",
      })
    })

    it("returns empty array gracefully for an agent with no reputation record", () => {
      const badges = resolveBadgesForAgent("agent-with-no-record-at-all-xyz")
      expect(Array.isArray(badges)).toBe(true)
    })

    it("sorts badges most-recent-first", () => {
      upsertReputationMetrics("bot-0", {
        badges: [
          { id: "first-quest", rarity: "common", awardedAt: "2026-04-01T00:00:00.000Z" },
          { id: "zk-certified", rarity: "epic", awardedAt: "2026-06-20T00:00:00.000Z" },
          { id: "rare-taskmaster", rarity: "rare", awardedAt: "2026-05-15T00:00:00.000Z" },
        ],
      })
      const badges = resolveBadgesForAgent("bot-0")
      expect(badges[0].id).toBe("zk-certified")   // June – most recent
      expect(badges[1].id).toBe("rare-taskmaster") // May
      expect(badges[2].id).toBe("first-quest")     // April – oldest
    })

    it("is idempotent across multiple calls for the same agent", () => {
      upsertReputationMetrics("bot-0", {
        badges: [{ id: "zk-certified", rarity: "epic", awardedAt: "2026-06-20T00:00:00.000Z" }],
      })
      const first = resolveBadgesForAgent("bot-0")
      const second = resolveBadgesForAgent("bot-0")
      expect(first).toEqual(second)
    })
  })
})
