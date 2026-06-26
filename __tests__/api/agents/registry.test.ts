import { beforeEach, describe, expect, it } from "vitest"
import { DELETE, GET as getAgent } from "@/app/api/agents/[id]/route"
import { PUT as putCapabilities } from "@/app/api/agents/[id]/capabilities/route"
import { GET, POST } from "@/app/api/agents/route"
import { resetAgentRegistryForTests } from "@/lib/agent-registry"
import { resetAgentHealthStore, recordAgentHeartbeat } from "@/lib/agents/agent-health-store"

function agentContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

const manifest = {
  agentId: "nexus-7",
  model: "claude-haiku-4-5",
  district: "data-center",
  capabilities: ["data-indexing", "log-analysis"],
  x402: { accepts: true, pricePerTask: "0.01 XLM" },
  status: "active",
  endpoint: "https://open-stellar.vercel.app/agents/nexus-7",
}

beforeEach(() => {
  resetAgentRegistryForTests()
})

describe("agent registry API", () => {
  it("registers, lists, filters, and retrieves agents", async () => {
    const post = await POST(new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifest),
    }))
    const postBody = await post.json()

    expect(post.status).toBe(201)
    expect(postBody.agent.agentId).toBe("nexus-7")
    expect(postBody.agent.registeredAt).toEqual(expect.any(String))

    const list = await GET(new Request("http://localhost/api/agents?district=data-center&status=active&skill=log-analysis"))
    const listBody = await list.json()

    expect(listBody.agents).toHaveLength(1)
    expect(listBody.agents[0].endpoint).toBe(manifest.endpoint)

    const single = await getAgent(new Request("http://localhost/api/agents/nexus-7"), agentContext("nexus-7"))
    const singleBody = await single.json()

    expect(single.status).toBe(200)
    expect(singleBody.agent.capabilities).toContain("data-indexing")
  })

  it("updates capabilities and deregisters agents", async () => {
    await POST(new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifest),
    }))

    const update = await putCapabilities(new Request("http://localhost/api/agents/nexus-7/capabilities", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capabilities: ["payments", "task-routing"] }),
    }), agentContext("nexus-7"))
    const updateBody = await update.json()

    expect(update.status).toBe(200)
    expect(updateBody.agent.capabilities).toEqual(["payments", "task-routing"])

    const deleted = await DELETE(new Request("http://localhost/api/agents/nexus-7", { method: "DELETE" }), agentContext("nexus-7"))
    expect(deleted.status).toBe(200)

    const missing = await getAgent(new Request("http://localhost/api/agents/nexus-7"), agentContext("nexus-7"))
    expect(missing.status).toBe(404)
  })

  it("rejects invalid manifests", async () => {
    const post = await POST(new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...manifest, district: "unknown" }),
    }))

    expect(post.status).toBe(400)
  })

  it("filters agents by q, capability, tag, and health status", async () => {
    resetAgentHealthStore()
    
    // Create 3 agents
    const agents = [
      {
        ...manifest,
        agentId: "agent-mol-1",
        capabilities: ["payment"],
        tags: ["finance", "v1"],
        status: "active",
      },
      {
        ...manifest,
        agentId: "agent-x-2",
        capabilities: ["search"],
        tags: ["v1"],
        status: "active",
      },
      {
        ...manifest,
        agentId: "agent-mol-3",
        capabilities: ["payment", "search"],
        tags: ["finance", "v2"],
        status: "offline",
      }
    ]

    for (const agent of agents) {
      await POST(new Request("http://localhost/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agent),
      }))
    }

    // Set health statuses
    recordAgentHeartbeat("agent-mol-1", { status: "active", nowMs: Date.now() })
    recordAgentHeartbeat("agent-x-2", { status: "active", nowMs: Date.now() })
    // agent-mol-3 is offline (no heartbeat so it's stale/offline, wait, if no heartbeat and no previous heartbeat, `getAgentHealth` returns null, which defaults to "offline")

    // Test capability filter
    let res = await GET(new Request("http://localhost/api/agents?capability=payment"))
    let body = await res.json()
    expect(body.agents).toHaveLength(2)
    expect(body.agents.map((a: any) => a.agentId).sort()).toEqual(["agent-mol-1", "agent-mol-3"])

    // Test status=offline filter
    res = await GET(new Request("http://localhost/api/agents?status=offline"))
    body = await res.json()
    expect(body.agents).toHaveLength(1)
    expect(body.agents[0].agentId).toBe("agent-mol-3")

    // Test q=mol filter
    res = await GET(new Request("http://localhost/api/agents?q=mol"))
    body = await res.json()
    expect(body.agents).toHaveLength(2)
    expect(body.agents.map((a: any) => a.agentId).sort()).toEqual(["agent-mol-1", "agent-mol-3"])
    
    // Test multiple filters compose (AND logic)
    res = await GET(new Request("http://localhost/api/agents?q=mol&capability=payment&tag=v2"))
    body = await res.json()
    expect(body.agents).toHaveLength(1)
    expect(body.agents[0].agentId).toBe("agent-mol-3")
  })
})
