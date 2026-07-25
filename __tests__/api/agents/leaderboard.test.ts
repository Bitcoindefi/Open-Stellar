import { describe, it, expect, beforeEach } from "vitest"
import { GET } from "@/app/api/agents/leaderboard/route"
import { resetAgentHealthStore, seedAgentHealthRecord } from "@/lib/agents/agent-health-store"
import { awardXP } from "@/lib/gamification/xp"
import { upsertReputationMetrics } from "@/lib/reputation/reputation-store"

describe("GET /api/agents/leaderboard", () => {
  beforeEach(() => {
    resetAgentHealthStore()
  })

  it("returns 400 Bad Request if limit > 100", async () => {
    const req = new Request("http://localhost/api/agents/leaderboard?limit=101")
    const res = await GET(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Bad Request: Limit cannot exceed 100")
  })

  it("sorts by XP by default and applies limits", async () => {
    const prefix = "xp-agent-"
    for (let i = 1; i <= 5; i++) {
      const agentId = `${prefix}${i}`
      seedAgentHealthRecord(agentId)
      awardXP(agentId, i * 100, "task.completed")
    }
    
    const req = new Request(`http://localhost/api/agents/leaderboard?limit=2`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    
    expect(data.total).toBe(5)
    expect(data.limit).toBe(2)
    expect(data.offset).toBe(0)
    expect(data.agents.length).toBe(2)
    expect(data.agents[0].agentId).toBe(`${prefix}5`)
    expect(data.agents[0].rank).toBe(1)
    expect(data.agents[1].agentId).toBe(`${prefix}4`)
    expect(data.agents[1].rank).toBe(2)
  })

  it("sorts by reputation", async () => {
    const prefix = "rep-agent-"
    for (let i = 1; i <= 5; i++) {
      const agentId = `${prefix}${i}`
      seedAgentHealthRecord(agentId)
      upsertReputationMetrics(agentId, { tasksCompleted: i * 50 })
    }
    
    const req = new Request(`http://localhost/api/agents/leaderboard?sort=reputation&limit=3`)
    const res = await GET(req)
    const data = await res.json()
    
    expect(data.agents.length).toBe(3)
    expect(data.agents[0].agentId).toBe(`${prefix}5`)
    expect(data.agents[0].rank).toBe(1)
    expect(data.agents[2].agentId).toBe(`${prefix}3`)
    expect(data.agents[2].rank).toBe(3)
  })

  it("sorts by tasks and handles offset correctly", async () => {
    const prefix = "task-agent-"
    for (let i = 1; i <= 5; i++) {
      const agentId = `${prefix}${i}`
      seedAgentHealthRecord(agentId)
      upsertReputationMetrics(agentId, { tasksCompleted: i * 10 })
    }
    
    const req = new Request(`http://localhost/api/agents/leaderboard?sort=tasks&offset=2&limit=2`)
    const res = await GET(req)
    const data = await res.json()
    
    expect(data.total).toBe(5)
    expect(data.offset).toBe(2)
    expect(data.agents.length).toBe(2)
    
    expect(data.agents[0].agentId).toBe(`${prefix}3`) 
    expect(data.agents[0].rank).toBe(3)
    expect(data.agents[1].agentId).toBe(`${prefix}2`)
    expect(data.agents[1].rank).toBe(4)
  })
})
