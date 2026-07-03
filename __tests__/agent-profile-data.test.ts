import { describe, expect, it } from "vitest"
import { createAgents } from "@/lib/data"
import {
  formatAgentJoinedDate,
  getAgentBadgeShowcase,
  getAgentGlobalRank,
  getAgentJoinedDate,
  getAgentPassportStatus,
  getAgentPrimaryMarketplaceHref,
  getAgentProfileServices,
  getAgentRecentActivity,
  getAgentXpHistory,
} from "@/lib/agent-profile-data"
import { getAgentCardStats } from "@/lib/og-card-data"

describe("agent profile data helpers", () => {
  it("returns deterministic rank and joined date display values", () => {
    const agents = createAgents()
    const [agent] = agents

    expect(getAgentGlobalRank(agent, agents)).toBeGreaterThanOrEqual(1)
    expect(getAgentGlobalRank(agent, agents)).toBeLessThanOrEqual(agents.length)
    expect(formatAgentJoinedDate(getAgentJoinedDate(agent))).toBe("June 2026")
  })

  it("builds badge, service, activity, and passport sections for a profile", () => {
    const [agent] = createAgents()

    expect(getAgentBadgeShowcase(agent)).toHaveLength(6)
    expect(getAgentProfileServices(agent).length).toBeGreaterThan(0)
    expect(getAgentPrimaryMarketplaceHref(agent)).toMatch(/^\/marketplace/)
    expect(getAgentRecentActivity(agent)).toHaveLength(4)
    expect(getAgentPassportStatus(agent)).toMatchObject({
      verified: true,
      network: "Stellar mainnet",
    })
  })

  it("generates a 30 day XP history ending at the current profile level", () => {
    const [agent] = createAgents()
    const history = getAgentXpHistory(agent)
    const stats = getAgentCardStats(agent)

    expect(history).toHaveLength(30)
    expect(history[0].level).toBeLessThanOrEqual(history[history.length - 1].level)
    expect(history[history.length - 1].level).toBe(stats.level)
  })
})
