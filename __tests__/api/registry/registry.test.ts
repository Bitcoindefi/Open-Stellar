import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "@/app/api/registry/route"
import { POST } from "@/app/api/agents/route"
import { POST as HEARTBEAT } from "@/app/api/registry/[id]/heartbeat/route"
import { GET as HEALTH } from "@/app/api/registry/health/route"
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

describe("agent registry heartbeats and health", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-30T00:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("marks an agent online on heartbeat", async () => {
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(agentA) }))

    const res = await HEARTBEAT(new Request("http://localhost/api/registry/alpha-1/heartbeat", { method: "POST" }), { params: Promise.resolve({ id: "alpha-1" }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.agent.status).toBe("online")
    expect(body.agent.lastSeen).toBe("2026-06-30T00:00:00.000Z")
  })

  it("marks agents offline after missing two heartbeat intervals", async () => {
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...agentA, status: "online" }) }))

    vi.setSystemTime(new Date("2026-06-30T00:02:01.000Z"))

    const res = await GET(new Request("http://localhost/api/registry"))
    const body = await res.json()
    expect(body.agents).toHaveLength(1)
    expect(body.agents[0].status).toBe("offline")
  })

  it("removes agents that have been unseen for more than ten minutes", async () => {
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...agentA, status: "online" }) }))
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...agentB, status: "online" }) }))

    vi.setSystemTime(new Date("2026-06-30T00:10:01.000Z"))

    const healthRes = await HEALTH()
    const health = await healthRes.json()
    expect(health).toEqual({ online: 0, offline: 0, stale_removed_last_run: 2 })

    const registryRes = await GET(new Request("http://localhost/api/registry"))
    const registryBody = await registryRes.json()
    expect(registryBody.agents).toHaveLength(0)
  })

  it("filters online agents with status=online", async () => {
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...agentA, status: "online" }) }))
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...agentB, status: "offline" }) }))

    const res = await GET(new Request("http://localhost/api/registry?status=online"))
    const body = await res.json()
    expect(body.agents).toHaveLength(1)
    expect(body.agents[0].agentId).toBe("alpha-1")
    expect(body.agents[0].status).toBe("online")
  })

  it("returns online, offline, and stale removal counts from health", async () => {
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...agentA, status: "online" }) }))
    await POST(new Request("http://localhost/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...agentB, status: "offline" }) }))

    const res = await HEALTH()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ online: 1, offline: 1, stale_removed_last_run: 0 })
  })
})
