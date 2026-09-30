import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ isAuthorized: vi.fn(() => true) }))
vi.mock("@/lib/ai/jev", () => ({ isJevModel: vi.fn((model: string) => model === "typesafe-ai/jev"), evaluateWithJev: vi.fn() }))

import { POST } from "@/app/api/admin/connections/test/route"

function request(body: unknown) {
  return new Request("https://agentic-city.test/api/admin/connections/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/admin/connections/test", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("verifies a model key against a fixed provider endpoint without returning the credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "gpt-test" }] }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const res = await POST(request({ kind: "model", provider: "openai", model: "gpt-test", apiKey: "sk-test-key-123" }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toMatchObject({ ok: true, connected: true, provider: "OpenAI", modelAvailable: true })
    expect(JSON.stringify(data)).not.toContain("sk-test-key-123")
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/models")
  })

  it("rejects custom providers so a saved key cannot be forwarded to an arbitrary URL", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const res = await POST(request({ kind: "model", provider: "http://127.0.0.1", apiKey: "secret-test-key" }))

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("requires a successful Slack auth.test response, not only HTTP 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), { status: 200 })))

    const res = await POST(request({ kind: "connector", connector: "slack", apiKey: "slack-fixture-not-a-token" }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("Slack rejected")
  })
})
