import { beforeEach, describe, expect, it } from "vitest"
import { GET } from "@/app/api/task-offers/route"
import { getTaskBoardStatusCopy } from "@/components/task-board"
import { resetTaskOffersForTests, type TaskOfferRecord } from "@/lib/task-offers/store"

const future = "2100-01-01T00:00:00.000Z"
const expired = "2000-01-01T00:00:00.000Z"

function offer(overrides: Partial<TaskOfferRecord> = {}): TaskOfferRecord {
  return {
    id: "offer-a",
    title: "Review run logs",
    requiredCapability: "Log Analysis",
    rewardAmount: 12,
    rewardAsset: "XLM",
    deadline: future,
    status: "open",
    posterAgentId: "bot-1",
    workerAgentId: null,
    payload: { runId: "run-1" },
    escrowRef: "internal-escrow-reference",
    transitionLog: [{ actorId: "bot-1", at: "2026-09-20T00:00:00.000Z", state: "open" }],
    ...overrides,
  }
}

describe("GET /api/task-offers", () => {
  beforeEach(() => {
    resetTaskOffersForTests()
  })

  it("returns only live open offers and does not expose store-only fields", async () => {
    resetTaskOffersForTests([
      offer(),
      offer({ id: "claimed", status: "claimed" }),
      offer({ id: "expired", deadline: expired }),
    ])

    const response = await GET(new Request("http://localhost/api/task-offers"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toHaveLength(1)
    expect(body[0]).toEqual({
      id: "offer-a",
      title: "Review run logs",
      requiredCapability: "Log Analysis",
      rewardAmount: 12,
      rewardAsset: "XLM",
      deadline: future,
      status: "open",
      posterAgentId: "bot-1",
      workerAgentId: null,
      payload: { runId: "run-1" },
    })
    expect(body[0]).not.toHaveProperty("escrowRef")
    expect(body[0]).not.toHaveProperty("transitionLog")
  })

  it("filters open offers by capability", async () => {
    resetTaskOffersForTests([
      offer(),
      offer({ id: "offer-b", requiredCapability: "Protocol Design" }),
    ])

    const response = await GET(
      new Request("http://localhost/api/task-offers?cap=Protocol%20Design"),
    )
    const body = await response.json()

    expect(body.map((entry: { id: string }) => entry.id)).toEqual(["offer-b"])
  })
})

describe("task board request states", () => {
  it("keeps loading, API failure, and a real empty board visibly distinct", () => {
    expect(getTaskBoardStatusCopy("loading", 0)).toBe("Loading task offers...")
    expect(getTaskBoardStatusCopy("error", 0)).toBe(
      "Task offers are unavailable. Retrying automatically.",
    )
    expect(getTaskBoardStatusCopy("ready", 0)).toBe(
      "No open offers match this capability.",
    )
    expect(getTaskBoardStatusCopy("ready", 1)).toBeNull()
  })
})
