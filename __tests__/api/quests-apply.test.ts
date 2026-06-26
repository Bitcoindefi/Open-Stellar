import { describe, expect, it } from "vitest"

import { POST } from "@/app/api/quests/[id]/apply/route"
import { upsertReputationMetrics } from "@/lib/reputation/reputation-store"

const context = (id: string) => ({ params: Promise.resolve({ id }) })

function request(actorId: string): Request {
  return new Request("http://localhost/api/quests/weekly-onboard-marketplace-service/apply", {
    method: "POST",
    body: JSON.stringify({ actorId }),
    headers: { "Content-Type": "application/json" },
  })
}

describe("POST /api/quests/[id]/apply", () => {
  it("rejects applicants below the quest minimum reputation", async () => {
    const actorId = "quest-apply-low-reputation"
    upsertReputationMetrics(actorId, { tasksCompleted: 30 })

    const res = await POST(request(actorId), context("weekly-onboard-marketplace-service"))
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data).toEqual({
      ok: false,
      reason: "InsufficientReputation",
      required: 50,
      current: 30,
    })
  })

  it("allows applicants who meet the quest minimum reputation", async () => {
    const actorId = "quest-apply-eligible-reputation"
    upsertReputationMetrics(actorId, { tasksCompleted: 60 })

    const res = await POST(request(actorId), context("weekly-onboard-marketplace-service"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.actorId).toBe(actorId)
  })

  it("allows applications for quests without minimum reputation", async () => {
    const actorId = "quest-apply-ungated-reputation"
    upsertReputationMetrics(actorId, { tasksCompleted: 0 })

    const res = await POST(request(actorId), context("daily-complete-5-tasks"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.quest.minReputation).toBeUndefined()
  })
})
