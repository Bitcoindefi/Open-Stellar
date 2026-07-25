import { beforeEach, describe, expect, it } from "vitest"
import { GET } from "@/app/api/registry/route"
import { POST } from "@/app/api/agents/route"
import { resetAgentRegistryForTests } from "@/lib/agent-registry"

const agentA = {
  agentId: "alpha-1",
  model: "claude-haiku-4-5",
  district: "data-center",
  capabilities: ["payment", "analytics"],
  x402: { accepts: true },
  status: "active",
  endpoint: "https://example.com/alpha-1",
}

const agentB = {
  agentId: "beta-2",
  model: "claude-haiku-4-5",
  district: "comm-hub",
  capabilities: ["translation", "analytics"],
  x402: { accepts: false },
  status: "idle",
  endpoint: "https://example.com/beta-2",
}

beforeEach(() => {
  resetAgentRegistryForTests()
})

describe("GET /api/registry", () => {
  it("returns all agents when no capability filter is given", async () => {
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(agentA) }))
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(agentB) }))

    const res = await GET(new Request("http://localhost/api/registry"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.agents).toHaveLength(2)
  })

  it("filters agents by capability (exact match, case-insensitive)", async () => {
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(agentA) }))
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(agentB) }))

    const res = await GET(new Request("http://localhost/api/registry?capability=Payment"))
    const body = await res.json()
    expect(body.agents).toHaveLength(1)
    expect(body.agents[0].agentId).toBe("alpha-1")
  })

  it("returns agents matching a shared capability", async () => {
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(agentA) }))
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(agentB) }))

    const res = await GET(new Request("http://localhost/api/registry?capability=ANALYTICS"))
    const body = await res.json()
    expect(body.agents).toHaveLength(2)
  })

  it("returns empty array when no agents match", async () => {
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(agentA) }))

    const res = await GET(new Request("http://localhost/api/registry?capability=unknown"))
    const body = await res.json()
    expect(body.agents).toHaveLength(0)
  })

  it("returns empty array when registry is empty", async () => {
    const res = await GET(new Request("http://localhost/api/registry"))
    const body = await res.json()
    expect(body.agents).toHaveLength(0)
  })
})
