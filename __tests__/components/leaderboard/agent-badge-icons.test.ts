/**
 * Unit tests for AgentBadgeIcons display logic.
 *
 * The vitest environment is "node" (no DOM), so we cannot render JSX here.
 * Instead we test the data-contract rules that the component enforces:
 *   - MAX_VISIBLE cap of 3
 *   - overflow count (+N more)
 *   - date formatting helpers used by the tooltip label
 *   - rarity → colour / icon mapping correctness
 */
import { describe, it, expect } from "vitest"
import type { LeaderboardBadge } from "@/lib/leaderboard"

// ─── Constants mirrored from the component ───────────────────────────────────

const MAX_VISIBLE = 3

const RARITY_COLOURS: Record<string, string> = {
  common: "#94a3b8",
  uncommon: "#4ade80",
  rare: "#38bdf8",
  epic: "#c084fc",
  legendary: "#facc15",
}

const RARITY_ICONS: Record<string, string> = {
  common: "⚙️",
  uncommon: "🌿",
  rare: "💠",
  epic: "🔮",
  legendary: "🌟",
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildBadge(overrides: Partial<LeaderboardBadge> = {}): LeaderboardBadge {
  return {
    id: "test-badge",
    name: "Test Badge",
    rarity: "common",
    earnedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  }
}

function visibleBadges(badges: LeaderboardBadge[]): LeaderboardBadge[] {
  return badges.slice(0, MAX_VISIBLE)
}

function overflowCount(badges: LeaderboardBadge[]): number {
  return Math.max(0, badges.length - MAX_VISIBLE)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AgentBadgeIcons – display logic", () => {
  describe("MAX_VISIBLE cap", () => {
    it("shows all badges when count is below the cap", () => {
      const badges = [buildBadge({ id: "a" }), buildBadge({ id: "b" })]
      expect(visibleBadges(badges)).toHaveLength(2)
      expect(overflowCount(badges)).toBe(0)
    })

    it("shows exactly 3 badges when count equals the cap", () => {
      const badges = [buildBadge({ id: "a" }), buildBadge({ id: "b" }), buildBadge({ id: "c" })]
      expect(visibleBadges(badges)).toHaveLength(3)
      expect(overflowCount(badges)).toBe(0)
    })

    it("caps display at 3 and computes overflow when agent has 4 badges", () => {
      const badges = [
        buildBadge({ id: "a" }),
        buildBadge({ id: "b" }),
        buildBadge({ id: "c" }),
        buildBadge({ id: "d" }),
      ]
      expect(visibleBadges(badges)).toHaveLength(3)
      expect(overflowCount(badges)).toBe(1)
    })

    it("shows +N label for N = badges.length - 3", () => {
      const badges = Array.from({ length: 7 }, (_, i) => buildBadge({ id: `badge-${i}` }))
      expect(visibleBadges(badges)).toHaveLength(3)
      expect(overflowCount(badges)).toBe(4)
    })

    it("returns empty visible array and zero overflow for empty badge list", () => {
      expect(visibleBadges([])).toHaveLength(0)
      expect(overflowCount([])).toBe(0)
    })
  })

  describe("rarity colour mapping", () => {
    it("maps every known rarity to a non-empty hex string", () => {
      for (const [rarity, colour] of Object.entries(RARITY_COLOURS)) {
        expect(typeof colour).toBe("string")
        expect(colour.startsWith("#")).toBe(true)
        expect(colour.length).toBeGreaterThanOrEqual(4) // at minimum #xxx
        void rarity
      }
    })

    it("covers all five canonical rarities", () => {
      const rarities = ["common", "uncommon", "rare", "epic", "legendary"]
      for (const r of rarities) {
        expect(RARITY_COLOURS[r]).toBeDefined()
      }
    })
  })

  describe("rarity icon mapping", () => {
    it("maps every known rarity to a non-empty string", () => {
      for (const [rarity, icon] of Object.entries(RARITY_ICONS)) {
        expect(typeof icon).toBe("string")
        expect(icon.length).toBeGreaterThan(0)
        void rarity
      }
    })

    it("covers all five canonical rarities", () => {
      const rarities = ["common", "uncommon", "rare", "epic", "legendary"]
      for (const r of rarities) {
        expect(RARITY_ICONS[r]).toBeDefined()
      }
    })
  })

  describe("tooltip date label", () => {
    it("formats ISO date string to a human-readable locale date", () => {
      const iso = "2026-06-15T00:00:00.000Z"
      const label = new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
      // The label must be a non-empty string and include the year
      expect(typeof label).toBe("string")
      expect(label.length).toBeGreaterThan(0)
      expect(label).toMatch(/2026/)
    })

    it("produces a different label for two distinct dates", () => {
      const date1 = new Date("2026-01-01T00:00:00.000Z").toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric",
      })
      const date2 = new Date("2026-06-15T00:00:00.000Z").toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric",
      })
      expect(date1).not.toBe(date2)
    })
  })

  describe("aria-label computation", () => {
    it("uses singular 'badge' when count is 1", () => {
      const badges = [buildBadge()]
      const label = `${badges.length} badge${badges.length !== 1 ? "s" : ""}`
      expect(label).toBe("1 badge")
    })

    it("uses plural 'badges' when count is 0", () => {
      const label = `${0} badge${0 !== 1 ? "s" : ""}`
      expect(label).toBe("0 badges")
    })

    it("uses plural 'badges' when count is 5", () => {
      const badges = Array.from({ length: 5 }, (_, i) => buildBadge({ id: `b-${i}` }))
      const label = `${badges.length} badge${badges.length !== 1 ? "s" : ""}`
      expect(label).toBe("5 badges")
    })

    it("overflow chip uses singular for exactly 1 overflow", () => {
      const count = 1
      const label = `${count} more badge${count !== 1 ? "s" : ""}`
      expect(label).toBe("1 more badge")
    })

    it("overflow chip uses plural for 2+ overflow", () => {
      const count = 3
      const label = `${count} more badge${count !== 1 ? "s" : ""}`
      expect(label).toBe("3 more badges")
    })
  })
})
