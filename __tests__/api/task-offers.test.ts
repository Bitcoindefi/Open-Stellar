import { beforeEach, describe, expect, it } from "vitest"
import { GET } from "@/app/api/task-offers/route"
import {
  putTaskOffer,
  resetTaskOfferStoreForTests,
} from "@/lib/task-offers/store"

function seedOffer(overrides: Record<string, unknown> = {}) {
  return putTaskOffer({
    id: "offer-open",
    title: "Inspect a failed run",
    requiredCapability: "Log Analysis",
    rewardAmount: 14,
    rewardAsset: "XLM",
    deadline: "2099-01-01T00:00:00.000Z",
    status: "open",
    posterAgentId: "agent-poster",
    workerAgentId: null,
    payload: { runId: "run_1" },
    internalEscrowRef: "escrow-secret",
    internalCreatedAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  })
}

describe("GET /api/task-offers", () => {
  beforeEach(() => {
    resetTaskOfferStoreForTests()
  })

  it("returns only open, unexpired offers", async () => {
    seedOffer()
    seedOffer({ id: "claimed", status: "claimed" })
    seedOffer({ id: "expired", deadline: "2020-01-01T00:00:00.000Z" })

    const response = await GET(new Request("http://localhost/api/task-offers"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.offers.map((offer: { id: string }) => offer.id)).toEqual(["offer-open"])
  })

  it("filters open offers by capability", async () => {
    seedOffer()
    seedOffer({
      id: "protocol",
      requiredCapability: "Protocol Design",
      title: "Review payment terms",
    })

    const response = await GET(new Request("http://localhost/api/task-offers?cap=Protocol%20Design"))
    const body = await response.json()

    expect(body.offers).toHaveLength(1)
    expect(body.offers[0].id).toBe("protocol")
  })

  it("never exposes server-only store fields", async () => {
    seedOffer()

    const response = await GET(new Request("http://localhost/api/task-offers"))
    const body = await response.json()

    expect(body.offers[0].internalEscrowRef).toBeUndefined()
    expect(body.offers[0].internalCreatedAt).toBeUndefined()
  })

  it("returns an empty array when there is no live work", async () => {
    const response = await GET(new Request("http://localhost/api/task-offers"))
    const body = await response.json()

    expect(body).toEqual({ ok: true, offers: [] })
  })
})
