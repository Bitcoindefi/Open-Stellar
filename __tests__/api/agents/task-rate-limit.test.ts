import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "@/app/api/agents/[id]/task/route"

const { checkRateLimit, findAgentByLookup, getOrCreateAgent, normalizeTaskInput } = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  findAgentByLookup: vi.fn(),
  getOrCreateAgent: vi.fn(),
  normalizeTaskInput: vi.fn((input: unknown) => input),
}))

vi.mock("@/lib/agents/rate-limit-middleware", () => ({
  checkRateLimit,
}))

vi.mock("@/lib/og-card-data", () => ({
  findAgentByLookup,
}))

vi.mock("@/lib/agent-runtime/agent", () => ({
  getOrCreateAgent,
  listAgentTaskRecords: vi.fn(),
  normalizeTaskInput,
}))

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("POST /api/agents/[id]/task", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 429 with Retry-After when the agent is rate-limited", async () => {
    const start = vi.fn()
    const executeTask = vi.fn()

    findAgentByLookup.mockReturnValue(null)
    getOrCreateAgent.mockReturnValue({ id: "bot-1", start, executeTask })
    checkRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 2500 })

    const response = await POST(new Request("http://localhost/api/agents/bot-1/task", {
      method: "POST",
      body: JSON.stringify({ title: "Inspect" }),
      headers: { "Content-Type": "application/json" },
    }), context("bot-1"))
    const data = await response.json()

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("3")
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(data).toEqual({ ok: false, error: "rate_limit_exceeded" })
    expect(start).not.toHaveBeenCalled()
    expect(executeTask).not.toHaveBeenCalled()
  })
})
