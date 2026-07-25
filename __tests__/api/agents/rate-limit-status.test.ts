import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "@/app/api/agents/[id]/rate-limit/status/route"

const { getRateLimitStatus } = vi.hoisted(() => ({
  getRateLimitStatus: vi.fn(),
}))

vi.mock("@/lib/agents/rate-limit-store", () => ({
  getRateLimitStatus,
}))

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("GET /api/agents/[id]/rate-limit/status", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns the current rate-limit status for the requested agent", async () => {
    getRateLimitStatus.mockReturnValue({
      requestsInWindow: 12,
      limit: 100,
      windowMs: 60_000,
      resetsAt: "2026-06-27T00:00:00.000Z",
      rateLimitHits: 3,
    })

    const response = await GET(
      new Request("http://localhost/api/agents/bot-1/rate-limit/status"),
      context("bot-1"),
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(getRateLimitStatus).toHaveBeenCalledWith("bot-1")
    expect(data).toEqual({
      ok: true,
      agentId: "bot-1",
      status: {
        requestsInWindow: 12,
        limit: 100,
        windowMs: 60_000,
        resetsAt: "2026-06-27T00:00:00.000Z",
        rateLimitHits: 3,
      },
    })
  })
})
