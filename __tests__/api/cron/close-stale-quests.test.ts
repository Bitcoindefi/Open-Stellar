import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET as runCloseStaleQuests } from "@/app/api/cron/close-stale-quests/route"
import { createQuest, getQuest, resetQuestStore, STALE_THRESHOLD_MS } from "@/lib/quests/quest-store"
import { publishSystemEvent } from "@/lib/events/system-events"

vi.mock("@/lib/events/system-events", () => ({
  publishSystemEvent: vi.fn(),
}))

const publishMock = vi.mocked(publishSystemEvent)

function makeRequest(opts: { secret?: string } = {}) {
  const headers: Record<string, string> = {}
  if (opts.secret) headers["authorization"] = `Bearer ${opts.secret}`
  return new Request("http://localhost/api/cron/close-stale-quests", { headers })
}

const THIRTY_ONE_DAYS_AGO = new Date(Date.now() - STALE_THRESHOLD_MS - 1).toISOString()
const TWENTY_NINE_DAYS_AGO = new Date(Date.now() - STALE_THRESHOLD_MS + 24 * 60 * 60 * 1000).toISOString()

beforeEach(() => {
  delete process.env.CRON_SECRET
  publishMock.mockClear()
})

afterEach(() => {
  resetQuestStore()
  delete process.env.CRON_SECRET
})

describe("GET /api/cron/close-stale-quests — authorization", () => {
  it("returns 401 without a correct CRON_SECRET", async () => {
    process.env.CRON_SECRET = "my-secret"

    const res = await runCloseStaleQuests(makeRequest())
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.ok).toBe(false)
  })

  it("returns 401 with a wrong CRON_SECRET", async () => {
    process.env.CRON_SECRET = "my-secret"

    const res = await runCloseStaleQuests(makeRequest({ secret: "wrong-secret" }))
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.ok).toBe(false)
  })

  it("allows through when CRON_SECRET matches", async () => {
    process.env.CRON_SECRET = "my-secret"

    const res = await runCloseStaleQuests(makeRequest({ secret: "my-secret" }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it("allows through when CRON_SECRET is not configured", async () => {
    const res = await runCloseStaleQuests(makeRequest())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
  })
})

describe("GET /api/cron/close-stale-quests — stale in-progress quests", () => {
  it("transitions a stale in-progress quest to abandoned", async () => {
    createQuest({ id: "q-stale", title: "Fix orbital drift", assignedTo: "agent-1", updatedAt: THIRTY_ONE_DAYS_AGO })

    const res = await runCloseStaleQuests(makeRequest())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.abandoned).toHaveLength(1)
    expect(data.abandoned[0].id).toBe("q-stale")
    expect(data.abandoned[0].status).toBe("abandoned")
    expect(data.expired).toHaveLength(0)

    expect(getQuest("q-stale")?.status).toBe("abandoned")
  })

  it("emits quest.abandoned event for each stale in-progress quest", async () => {
    createQuest({ id: "q-a1", title: "Calibrate sensors", assignedTo: "agent-2", updatedAt: THIRTY_ONE_DAYS_AGO })
    createQuest({ id: "q-a2", title: "Map nebula", assignedTo: "agent-3", updatedAt: THIRTY_ONE_DAYS_AGO })

    await runCloseStaleQuests(makeRequest())

    const abandonedCalls = publishMock.mock.calls.filter(([e]) => e.type === "quest.abandoned")
    expect(abandonedCalls).toHaveLength(2)
    expect(abandonedCalls.map(([e]) => (e as { questId: string }).questId).sort()).toEqual(["q-a1", "q-a2"].sort())
  })

  it("does not close in-progress quests updated within the last 30 days", async () => {
    createQuest({ id: "q-fresh", title: "Recent PR activity", assignedTo: "agent-4", updatedAt: TWENTY_NINE_DAYS_AGO })

    const res = await runCloseStaleQuests(makeRequest())
    const data = await res.json()

    expect(data.abandoned).toHaveLength(0)
    expect(getQuest("q-fresh")?.status).toBe("in_progress")
  })
})

describe("GET /api/cron/close-stale-quests — unassigned quests with no applicants", () => {
  it("transitions a stale unassigned quest with no applicants to expired", async () => {
    createQuest({ id: "q-expire", title: "Explore sector 7", updatedAt: THIRTY_ONE_DAYS_AGO })

    const res = await runCloseStaleQuests(makeRequest())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.expired).toHaveLength(1)
    expect(data.expired[0].id).toBe("q-expire")
    expect(data.expired[0].status).toBe("expired")
    expect(data.abandoned).toHaveLength(0)

    expect(getQuest("q-expire")?.status).toBe("expired")
  })

  it("emits quest.expired event for each expired unassigned quest", async () => {
    createQuest({ id: "q-e1", title: "Survey asteroid belt", updatedAt: THIRTY_ONE_DAYS_AGO })

    await runCloseStaleQuests(makeRequest())

    const expiredCalls = publishMock.mock.calls.filter(([e]) => e.type === "quest.expired")
    expect(expiredCalls).toHaveLength(1)
    expect((expiredCalls[0][0] as { questId: string }).questId).toBe("q-e1")
  })

  it("does not expire unassigned quests that still have applicants", async () => {
    createQuest({ id: "q-applicants", title: "Has applicants", applicants: ["agent-5"], updatedAt: THIRTY_ONE_DAYS_AGO })

    const res = await runCloseStaleQuests(makeRequest())
    const data = await res.json()

    expect(data.expired).toHaveLength(0)
    expect(getQuest("q-applicants")?.status).toBe("open")
  })

  it("does not expire unassigned quests updated within the last 30 days", async () => {
    createQuest({ id: "q-fresh-open", title: "New quest", updatedAt: TWENTY_NINE_DAYS_AGO })

    const res = await runCloseStaleQuests(makeRequest())
    const data = await res.json()

    expect(data.expired).toHaveLength(0)
    expect(getQuest("q-fresh-open")?.status).toBe("open")
  })
})

describe("GET /api/cron/close-stale-quests — no quests closed when all are fresh", () => {
  it("returns empty arrays when all quests are within the 30-day window", async () => {
    createQuest({ id: "q-ok-1", title: "Active quest", assignedTo: "agent-6", updatedAt: TWENTY_NINE_DAYS_AGO })
    createQuest({ id: "q-ok-2", title: "Open quest", updatedAt: TWENTY_NINE_DAYS_AGO })

    const res = await runCloseStaleQuests(makeRequest())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.abandoned).toHaveLength(0)
    expect(data.expired).toHaveLength(0)
    expect(publishMock).not.toHaveBeenCalled()
  })
})

describe("GET /api/cron/close-stale-quests — already-closed quests are skipped", () => {
  it("does not re-close completed or already-abandoned quests", async () => {
    createQuest({ id: "q-done", title: "Done quest", status: "completed", updatedAt: THIRTY_ONE_DAYS_AGO })
    createQuest({ id: "q-already-abandoned", title: "Old abandoned", status: "abandoned", updatedAt: THIRTY_ONE_DAYS_AGO })

    const res = await runCloseStaleQuests(makeRequest())
    const data = await res.json()

    expect(data.abandoned).toHaveLength(0)
    expect(data.expired).toHaveLength(0)
    expect(publishMock).not.toHaveBeenCalled()
  })
})

describe("GET /api/cron/close-stale-quests — unit test: 31-day-old quest becomes abandoned", () => {
  it("quest created 31 days ago with assignedTo set transitions to abandoned", async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - STALE_THRESHOLD_MS - 1).toISOString()
    createQuest({ id: "q-unit", title: "Unit test quest", assignedTo: "agent-unit", updatedAt: thirtyOneDaysAgo })

    expect(getQuest("q-unit")?.status).toBe("in_progress")

    const res = await runCloseStaleQuests(makeRequest())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(getQuest("q-unit")?.status).toBe("abandoned")

    const abandonedCall = publishMock.mock.calls.find(([e]) => e.type === "quest.abandoned")
    expect(abandonedCall).toBeDefined()
    expect((abandonedCall![0] as { questId: string }).questId).toBe("q-unit")
  })
})
