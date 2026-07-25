import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { GET, POST } from "@/app/api/quests/route"
import { resetQuestStore, seedQuest } from "@/lib/gamification/quest-store"

describe("GET /api/quests", () => {
  beforeEach(() => {
    resetQuestStore()
  })

  afterEach(() => {
    resetQuestStore()
  })

  it("excludes expired quests by default", async () => {
    seedQuest({ id: "q-active", title: "Active", status: "in_progress" })
    seedQuest({ id: "q-expired", title: "Expired", status: "expired" })

    const req = new Request("http://localhost/api/quests")
    const res = await GET(req)
    const body = await res.json()

    expect(body.ok).toBe(true)
    const ids = body.quests.map((q: { id: string }) => q.id)
    expect(ids).toContain("q-active")
    expect(ids).not.toContain("q-expired")
  })

  it("includes expired quests with include_expired=true", async () => {
    seedQuest({ id: "q-active-2", title: "Active", status: "in_progress" })
    seedQuest({ id: "q-expired-2", title: "Expired", status: "expired" })

    const req = new Request("http://localhost/api/quests?include_expired=true")
    const res = await GET(req)
    const body = await res.json()

    expect(body.ok).toBe(true)
    const ids = body.quests.map((q: { id: string }) => q.id)
    expect(ids).toContain("q-active-2")
    expect(ids).toContain("q-expired-2")
  })
})

describe("POST /api/quests", () => {
  beforeEach(() => {
    resetQuestStore()
  })

  afterEach(() => {
    resetQuestStore()
  })

  it("accepts optional expiresAt ISO-8601 string", async () => {
    const expiresAt = new Date(Date.now() + 86400000).toISOString()
    const req = new Request("http://localhost/api/quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "new-quest",
        type: "daily",
        title: "New Quest",
        description: "A test quest",
        reward: { xp: 100 },
        expiresAt,
        assignedAgentIds: ["agent-1"],
      }),
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.quest.id).toBe("new-quest")
    expect(body.quest.expiresAt).toBe(expiresAt)
    expect(body.quest.status).toBe("in_progress")
  })

  it("defaults expiresAt to undefined when omitted", async () => {
    const req = new Request("http://localhost/api/quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "no-expiry-quest",
        type: "story",
        title: "Permanent Quest",
        description: "Never expires",
        reward: { xp: 500 },
      }),
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.quest.expiresAt).toBeUndefined()
  })

  it("returns 400 when id or title is missing", async () => {
    const req = new Request("http://localhost/api/quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "daily" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toContain("required")
  })
})