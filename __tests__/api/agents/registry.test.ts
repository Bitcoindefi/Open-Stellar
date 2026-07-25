import { beforeEach, describe, expect, it } from "vitest"
import { DELETE, GET as getAgent } from "@/app/api/agents/[id]/route"
import { PUT as putCapabilities } from "@/app/api/agents/[id]/capabilities/route"
import { GET, POST } from "@/app/api/agents/route"
import { resetAgentRegistryForTests } from "@/lib/agent-registry"

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

  it("filters by capability (case-insensitive)", async () => {
    await POST(new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifest),
    }))
    await POST(new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...manifest, agentId: "nexus-8", capabilities: ["payment", "translation"] }),
    }))

    const res = await GET(new Request("http://localhost/api/agents?capability=DATA-INDEXING"))
    const body = await res.json()
    expect(body.agents).toHaveLength(1)
    expect(body.agents[0].agentId).toBe("nexus-7")

    const noneRes = await GET(new Request("http://localhost/api/agents?capability=unknown"))
    const noneBody = await noneRes.json()
    expect(noneBody.agents).toHaveLength(0)
  })
})
