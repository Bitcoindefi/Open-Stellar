import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { GET } from "@/app/api/cron/expire-quests/route"
import { resetQuestStore, seedQuest } from "@/lib/gamification/quest-store"
import { resetNotificationStore } from "@/lib/notifications/notification-store"

describe("GET /api/cron/expire-quests", () => {
  beforeEach(() => {
    resetQuestStore()
    resetNotificationStore()
  })

  afterEach(() => {
    resetQuestStore()
    resetNotificationStore()
  })

  it("returns 401 when CRON_SECRET is set and no auth header", async () => {
    const originalSecret = process.env.CRON_SECRET
    process.env.CRON_SECRET = "test-secret"

    const req = new Request("http://localhost/api/cron/expire-quests")
    const res = await GET(req)
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.ok).toBe(false)

    process.env.CRON_SECRET = originalSecret
  })

  it("expires past-deadline quests and returns counts", async () => {
    const originalSecret = process.env.CRON_SECRET
    process.env.CRON_SECRET = "test-secret"

    const past = new Date(Date.now() - 1).toISOString()
    seedQuest({
      id: "cron-expired-1",
      title: "Expired 1",
      expiresAt: past,
      assignedAgentIds: ["agent-x"],
      subTasks: [
        { id: "task-1", title: "Task 1", assignedAgentId: "agent-x", status: "in_progress" },
      ],
    })
    seedQuest({
      id: "cron-active-1",
      title: "Active 1",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      assignedAgentIds: ["agent-y"],
    })

    const req = new Request("http://localhost/api/cron/expire-quests", {
      headers: { authorization: "Bearer test-secret" },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.expired).toBe(1)
    expect(body.checked).toBe(2)
    expect(body.notified).toBe(1)
    expect(body.checkedAt).toBeDefined()

    process.env.CRON_SECRET = originalSecret
  })

  it("returns 200 with no auth when CRON_SECRET is not set", async () => {
    const originalSecret = process.env.CRON_SECRET
    delete process.env.CRON_SECRET

    const req = new Request("http://localhost/api/cron/expire-quests")
    const res = await GET(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)

    process.env.CRON_SECRET = originalSecret
  })
})
