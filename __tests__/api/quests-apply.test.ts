import { describe, expect, it, beforeEach, afterEach } from "vitest"

import { POST } from "@/app/api/quests/[id]/apply/route"
import { upsertReputationMetrics } from "@/lib/reputation/reputation-store"
import { resetQuestCompletions } from "@/lib/gamification/quest-completions"

const TOKEN = "test-gateway-token"
const context = (id: string) => ({ params: Promise.resolve({ id }) })

function request(actorId: string, opts: { auth?: boolean } = {}): Request {
  const auth = opts.auth ?? true
  return new Request("http://localhost/api/quests/weekly-onboard-marketplace-service/apply", {
    method: "POST",
    body: JSON.stringify({ actorId }),
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  })
}

describe("POST /api/quests/[id]/apply", () => {
  let originalToken: string | undefined

  beforeEach(() => {
    originalToken = process.env.MOLTBOT_GATEWAY_TOKEN
    process.env.MOLTBOT_GATEWAY_TOKEN = TOKEN
    resetQuestCompletions()
  })

  afterEach(() => {
    if (originalToken === undefined) delete process.env.MOLTBOT_GATEWAY_TOKEN
    else process.env.MOLTBOT_GATEWAY_TOKEN = originalToken
    resetQuestCompletions()
  })

  it("rejects unauthenticated requests with 401", async () => {
    const res = await POST(request("any-actor", { auth: false }), context("weekly-onboard-marketplace-service"))
    expect(res.status).toBe(401)
    expect((await res.json()).ok).toBe(false)
  })

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

  it("is idempotent on replay — a second claim does not re-trigger the reward", async () => {
    const actorId = "quest-apply-replayer"
    upsertReputationMetrics(actorId, { tasksCompleted: 0 })

    const first = await POST(request(actorId), context("daily-complete-5-tasks"))
    const firstData = await first.json()
    expect(first.status).toBe(200)
    expect(firstData.ok).toBe(true)
    expect(firstData.alreadyClaimed).toBeUndefined()

    const second = await POST(request(actorId), context("daily-complete-5-tasks"))
    const secondData = await second.json()
    expect(second.status).toBe(200)
    expect(secondData.ok).toBe(true)
    expect(secondData.alreadyClaimed).toBe(true)
  })

  it("rejects an empty actorId", async () => {
    const res = await POST(request("   "), context("daily-complete-5-tasks"))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("actorId is required")
  })
})
