import { describe, expect, it, beforeEach } from "vitest"
import { getAgentHealthSummary, recordAgentExecutionError, recordAgentExecutionSuccess, recordAgentInvocation, resetAgentErrorStoreForTests } from "@/lib/agents/agent-error-store"

describe("agent error store", () => {
  beforeEach(() => {
    resetAgentErrorStoreForTests()
  })

  it("tracks last invocation time and 24h error counts", () => {
    const now = new Date("2026-06-30T12:00:00.000Z")
    recordAgentInvocation("cloud-alpha", now)
    recordAgentExecutionError({ agentId: "cloud-alpha", error: new Error("boom"), taskExcerpt: "run diagnostics", date: now })

    expect(getAgentHealthSummary("cloud-alpha", now.getTime())).toEqual({
      agentId: "cloud-alpha",
      status: "active",
      lastSeen: now.toISOString(),
      errorCount24h: 1,
      degraded: false,
    })
  })

  it("marks an agent degraded after three consecutive errors", () => {
    const base = Date.parse("2026-06-30T12:00:00.000Z")
    for (let i = 0; i < 3; i += 1) {
      recordAgentExecutionError({
        agentId: "cloud-beta",
        error: new Error(`failure ${i + 1}`),
        taskExcerpt: "sync ledger",
        date: new Date(base + i * 1000),
      })
    }

    expect(getAgentHealthSummary("cloud-beta", base + 3000)).toMatchObject({
      agentId: "cloud-beta",
      status: "degraded",
      errorCount24h: 3,
      degraded: true,
    })
  })
  it("does not degrade when a successful invocation breaks the error streak", () => {
    const base = Date.parse("2026-06-30T12:00:00.000Z")
    recordAgentExecutionError({ agentId: "cloud-gamma", error: new Error("failure 1"), date: new Date(base) })
    recordAgentExecutionError({ agentId: "cloud-gamma", error: new Error("failure 2"), date: new Date(base + 1000) })
    recordAgentExecutionSuccess("cloud-gamma", new Date(base + 2000))
    recordAgentExecutionError({ agentId: "cloud-gamma", error: new Error("failure 3"), date: new Date(base + 3000) })

    expect(getAgentHealthSummary("cloud-gamma", base + 4000)).toMatchObject({
      status: "active",
      errorCount24h: 3,
      degraded: false,
    })
  })

})
