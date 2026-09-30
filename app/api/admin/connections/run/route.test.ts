import { beforeEach, describe, expect, it, vi } from "vitest"

const { authorized, generate } = vi.hoisted(() => ({ authorized: vi.fn(() => true), generate: vi.fn() }))
vi.mock("@/lib/auth", () => ({ isAuthorized: authorized }))
vi.mock("@/lib/ai/byok-provider", () => ({
  BYOK_PROVIDERS: {
    "vercel-ai-gateway": { label: "Vercel AI Gateway", style: "openai", endpoint: "https://ai-gateway.vercel.sh/v1" },
    openai: { label: "OpenAI", style: "openai", endpoint: "https://api.openai.com/v1" },
    anthropic: { label: "Anthropic", style: "anthropic", endpoint: "https://api.anthropic.com/v1" },
    groq: { label: "Groq", style: "openai", endpoint: "https://api.groq.com/openai/v1" },
    openrouter: { label: "OpenRouter", style: "openai", endpoint: "https://openrouter.ai/api/v1" },
  },
  generateWithByokProvider: generate,
}))

import { POST } from "@/app/api/admin/connections/run/route"

function request(body: unknown) {
  return new Request("https://agentic-city.test/api/admin/connections/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const connection = { provider: "openai", model: "gpt-test", apiKey: "private-test-key" }

describe("POST /api/admin/connections/run", () => {
  beforeEach(() => {
    authorized.mockReturnValue(true)
    generate.mockReset()
  })

  it("plans work with the leader, runs the assigned workers, and returns no credentials", async () => {
    generate.mockResolvedValueOnce(JSON.stringify({ tasks: [
      { memberId: "worker-a", title: "Research", instructions: "Find the current state." },
      { memberId: "worker-b", title: "Assess risk", instructions: "List key risks." },
    ] })).mockResolvedValueOnce("Research findings").mockResolvedValueOnce("Risk findings")

    const res = await POST(request({
      mission: "Assess an agent payments project",
      orchestrator: { name: "Lead", connection },
      members: [
        { id: "worker-a", name: "Researcher", role: "Research", connection },
        { id: "worker-b", name: "Analyst", role: "Risk analysis", connection },
      ],
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toMatchObject({ ok: true, orchestrator: "Lead", results: [
      { name: "Researcher", status: "completed", output: "Research findings" },
      { name: "Analyst", status: "completed", output: "Risk findings" },
    ] })
    expect(JSON.stringify(data)).not.toContain("private-test-key")
    expect(generate).toHaveBeenCalledTimes(3)
  })

  it("requires authentication before calling any configured model", async () => {
    authorized.mockReturnValue(false)

    const res = await POST(request({ mission: "Run", orchestrator: { connection }, members: [] }))

    expect(res.status).toBe(401)
    expect(generate).not.toHaveBeenCalled()
  })

  it("rejects unsupported providers before making model calls", async () => {
    const res = await POST(request({
      mission: "Run",
      orchestrator: { connection: { ...connection, provider: "http://localhost" } },
      members: [{ id: "worker-a", name: "Worker", role: "Research", connection }],
    }))

    expect(res.status).toBe(400)
    expect(generate).not.toHaveBeenCalled()
  })
})
