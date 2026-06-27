import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { GET } from "@/app/api/quests/leaderboard/route"
import { addNotification, resetNotificationStore } from "@/lib/notifications/notification-store"

function seedQuestCompleted(agentId: string, createdAt: Date) {
  addNotification({
    agentId,
    type: "quest_completed",
    title: "Quest completed",
    body: "Agent completed a quest",
    resourceHref: "/quests",
    resourceLabel: "Quests",
    createdAt: createdAt.toISOString(),
  })
}

describe("GET /api/quests/leaderboard", () => {
  beforeEach(() => {
    resetNotificationStore()
  })

  afterEach(() => {
    resetNotificationStore()
  })

  it("returns ranked entries for weekly period", async () => {
    const now = Date.now()
    const today = new Date(now)

    seedQuestCompleted("agent-1", today)
    seedQuestCompleted("agent-1", new Date(today.getTime() - 1000))
    seedQuestCompleted("agent-2", today)

    const req = new Request("http://localhost/api/quests/leaderboard?period=weekly")
    const res = await GET(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.period).toBe("weekly")
    expect(body.entries).toHaveLength(2)
    expect(body.entries[0].agentId).toBe("agent-1")
    expect(body.entries[0].questsCompleted).toBe(2)
    expect(body.entries[0].rank).toBe(1)
    expect(body.entries[1].agentId).toBe("agent-2")
    expect(body.entries[1].questsCompleted).toBe(1)
    expect(body.entries[1].rank).toBe(2)
    expect(body.count).toBe(2)
  })

  it("defaults to weekly when period is omitted", async () => {
    const today = new Date()
    seedQuestCompleted("agent-x", today)

    const req = new Request("http://localhost/api/quests/leaderboard")
    const res = await GET(req)
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.period).toBe("weekly")
    expect(body.entries).toHaveLength(1)
  })

  it("returns empty entries when no quests completed", async () => {
    const req = new Request("http://localhost/api/quests/leaderboard?period=weekly")
    const res = await GET(req)
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.entries).toEqual([])
    expect(body.count).toBe(0)
  })

  it("supports daily period", async () => {
    const today = new Date()
    seedQuestCompleted("agent-daily", today)

    const req = new Request("http://localhost/api/quests/leaderboard?period=daily")
    const res = await GET(req)
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.period).toBe("daily")
    expect(body.entries).toHaveLength(1)
  })

  it("ignores invalid period and defaults to weekly", async () => {
    const today = new Date()
    seedQuestCompleted("agent-y", today)

    const req = new Request("http://localhost/api/quests/leaderboard?period=invalid")
    const res = await GET(req)
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.period).toBe("weekly")
  })
})