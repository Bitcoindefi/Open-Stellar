import { describe, it, expect, beforeEach } from "vitest"
import { GET } from "@/app/api/agents/[id]/capabilities/compat/route"
import { registerAgent, resetAgentRegistryForTests } from "@/lib/agent-registry"

function agentContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("GET /api/agents/:id/capabilities/compat", () => {
  beforeEach(() => {
    resetAgentRegistryForTests()
  })

  it("returns 404 for unknown agent", async () => {
    const req = new Request("http://localhost/api/agents/unknown/capabilities/compat?callerVersion=1.0.0")
    const res = await GET(req, agentContext("unknown"))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.ok).toBe(false)
  })

  it("returns 400 when callerVersion is missing", async () => {
    registerAgent({
      agentId: "bot-compat",
      model: "test-model",
      district: "data-center",
      capabilities: ["translate"],
      status: "active",
      endpoint: "http://test",
      x402: { accepts: true }
    })

    const req = new Request("http://localhost/api/agents/bot-compat/capabilities/compat")
    const res = await GET(req, agentContext("bot-compat"))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("callerVersion")
  })

  it("returns compatible=true when all skills match caller version", async () => {
    registerAgent({
      agentId: "bot-compat",
      model: "test-model",
      district: "data-center",
      capabilities: ["translate", "summarize"],
      skillVersions: [
        { id: "translate", version: "2.1.0" },
        { id: "summarize", version: "3.0.0", minCallerVersion: ">=2.0.0" },
      ],
      status: "active",
      endpoint: "http://test",
      x402: { accepts: true }
    })

    const req = new Request("http://localhost/api/agents/bot-compat/capabilities/compat?callerVersion=2.5.0")
    const res = await GET(req, agentContext("bot-compat"))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.compatible).toBe(true)
    expect(json.skills).toEqual([
      { id: "translate", version: "2.1.0", compatible: true },
      { id: "summarize", version: "3.0.0", compatible: true },
    ])
  })

  it("returns compatible=false for skills with incompatible minCallerVersion", async () => {
    registerAgent({
      agentId: "bot-incompat",
      model: "test-model",
      district: "data-center",
      capabilities: ["translate", "summarize"],
      skillVersions: [
        { id: "translate", version: "2.1.0" },
        { id: "summarize", version: "3.0.0", minCallerVersion: ">=2.0.0" },
      ],
      status: "active",
      endpoint: "http://test",
      x402: { accepts: true }
    })

    const req = new Request("http://localhost/api/agents/bot-incompat/capabilities/compat?callerVersion=1.0.0")
    const res = await GET(req, agentContext("bot-incompat"))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.compatible).toBe(false)
    expect(json.skills).toEqual([
      { id: "translate", version: "2.1.0", compatible: true },
      { id: "summarize", version: "3.0.0", compatible: false, requires: ">=2.0.0" },
    ])
  })

  it("returns compatible=true for skills without minCallerVersion regardless of callerVersion", async () => {
    registerAgent({
      agentId: "bot-no-min",
      model: "test-model",
      district: "data-center",
      capabilities: ["translate"],
      skillVersions: [
        { id: "translate", version: "2.1.0" },
      ],
      status: "active",
      endpoint: "http://test",
      x402: { accepts: true }
    })

    const req = new Request("http://localhost/api/agents/bot-no-min/capabilities/compat?callerVersion=0.1.0")
    const res = await GET(req, agentContext("bot-no-min"))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.compatible).toBe(true)
    expect(json.skills).toEqual([
      { id: "translate", version: "2.1.0", compatible: true },
    ])
  })

  it("defaults missing version to 1.0.0", async () => {
    registerAgent({
      agentId: "bot-default",
      model: "test-model",
      district: "data-center",
      capabilities: ["translate"],
      skillVersions: [
        { id: "translate", minCallerVersion: ">=1.0.0" },
      ],
      status: "active",
      endpoint: "http://test",
      x402: { accepts: true }
    })

    const req = new Request("http://localhost/api/agents/bot-default/capabilities/compat?callerVersion=1.0.0")
    const res = await GET(req, agentContext("bot-default"))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.skills).toEqual([
      { id: "translate", version: "1.0.0", compatible: true },
    ])
  })

  it("handles semver range operators correctly", async () => {
    registerAgent({
      agentId: "bot-semver",
      model: "test-model",
      district: "data-center",
      capabilities: ["translate", "summarize", "analyze"],
      skillVersions: [
        { id: "translate", version: "1.0.0", minCallerVersion: "^1.0.0" },
        { id: "summarize", version: "2.0.0", minCallerVersion: ">=1.5.0 <3.0.0" },
        { id: "analyze", version: "3.0.0", minCallerVersion: "~3.0.0" },
      ],
      status: "active",
      endpoint: "http://test",
      x402: { accepts: true }
    })

    const req = new Request("http://localhost/api/agents/bot-semver/capabilities/compat?callerVersion=1.2.3")
    const res = await GET(req, agentContext("bot-semver"))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.compatible).toBe(false)
    expect(json.skills).toEqual([
      { id: "translate", version: "1.0.0", compatible: true },
      { id: "summarize", version: "2.0.0", compatible: false, requires: ">=1.5.0 <3.0.0" },
      { id: "analyze", version: "3.0.0", compatible: false, requires: "~3.0.0" },
    ])
  })
})