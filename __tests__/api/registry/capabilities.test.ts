import { beforeEach, describe, expect, it } from "vitest"
import { GET } from "@/app/api/registry/capabilities/route"
import { POST } from "@/app/api/agents/route"
import { resetAgentRegistryForTests } from "@/lib/agent-registry"

const makeAgent = (id: string, capabilities: string[]) => ({
  agentId: id,
  model: "claude-haiku-4-5",
  district: "data-center",
  capabilities,
  x402: { accepts: false },
  status: "active",
  endpoint: `https://example.com/${id}`,
})

beforeEach(() => {
  resetAgentRegistryForTests()
})

async function register(id: string, capabilities: string[]) {
  return POST(new Request("http://localhost/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(makeAgent(id, capabilities)),
  }))
}

describe("GET /api/registry/capabilities", () => {
  it("returns empty array when no agents are registered", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.capabilities).toEqual([])
  })

  it("returns capabilities sorted by count descending", async () => {
    await register("a1", ["payment", "analytics", "translation"])
    await register("a2", ["payment", "analytics"])
    await register("a3", ["payment"])

    const res = await GET()
    const body = await res.json()
    expect(body.capabilities[0]).toEqual({ capability: "payment", count: 3 })
    expect(body.capabilities[1]).toEqual({ capability: "analytics", count: 2 })
    expect(body.capabilities[2]).toEqual({ capability: "translation", count: 1 })
  })

  it("breaks count ties alphabetically", async () => {
    await register("a1", ["zebra", "apple"])
    await register("a2", ["zebra", "apple"])

    const res = await GET()
    const body = await res.json()
    expect(body.capabilities[0].capability).toBe("apple")
    expect(body.capabilities[1].capability).toBe("zebra")
  })

  it("counts each capability once per agent (no duplicates within one agent)", async () => {
    await register("a1", ["payment"])
    await register("a2", ["payment"])

    const res = await GET()
    const body = await res.json()
    expect(body.capabilities).toHaveLength(1)
    expect(body.capabilities[0]).toEqual({ capability: "payment", count: 2 })
  })
})
