import { beforeEach, describe, expect, it } from "vitest"
import { DELETE as deleteRegistryAgent, PATCH as patchRegistryAgent } from "@/app/api/registry/[id]/route"
import { GET } from "@/app/api/registry/route"
import { POST } from "@/app/api/agents/route"
import { resetAgentRegistryForTests } from "@/lib/agent-registry"
import { resetAgentXpDb } from "@/lib/gamification/xp"
import { resetReputationStoreForTests } from "@/lib/reputation/reputation-store"

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
  resetAgentXpDb()
  resetReputationStoreForTests()
})

function agentContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("GET /api/registry", () => {
  it("returns all agents when no capability filter is given", async () => {
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(agentA) }))
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(agentB) }))

    const res = await GET(new Request("http://localhost/api/registry"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.agents).toHaveLength(2)
    expect(body.agents[0]).toHaveProperty("xp")
    expect(body.agents[0]).toHaveProperty("tasksCompleted")
    expect(body.agents[0]).toHaveProperty("lastSeen")
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

  it("forces an agent offline via PATCH /api/registry/[id]", async () => {
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(agentA) }))

    const res = await patchRegistryAgent(
      new Request("http://localhost/api/registry/alpha-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "offline" }),
      }),
      agentContext("alpha-1"),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.agent.status).toBe("offline")
  })

  it("deregisters an agent via DELETE /api/registry/[id]", async () => {
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(agentA) }))

    const res = await deleteRegistryAgent(
      new Request("http://localhost/api/registry/alpha-1", { method: "DELETE" }),
      agentContext("alpha-1"),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.agent.agentId).toBe("alpha-1")

    const list = await GET(new Request("http://localhost/api/registry"))
    expect((await list.json()).agents).toHaveLength(0)
  })
})
