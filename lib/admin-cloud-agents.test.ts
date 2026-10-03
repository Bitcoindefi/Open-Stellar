import { describe, expect, it, vi } from "vitest"
import { fetchCloudAgentsForAdmin } from "@/lib/admin-cloud-agents"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

function routes(session: () => Response, agents?: () => Response) {
  return vi.fn(async (url: string) => {
    if (url === "/api/admin/session") return session()
    if (url === "/api/admin/agents" && agents) return agents()
    throw new Error(`unexpected ${url}`)
  })
}

describe("fetchCloudAgentsForAdmin", () => {
  it("never calls the protected route for a visitor without an admin session", async () => {
    const fetchImpl = routes(() => json({ authenticated: false }))
    expect(await fetchCloudAgentsForAdmin(fetchImpl)).toEqual({ kind: "not-admin" })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith("/api/admin/session", { cache: "no-store" })
  })

  it("treats an unreadable session answer as no session", async () => {
    const fetchImpl = routes(() => new Response("not json", { status: 200 }))
    expect(await fetchCloudAgentsForAdmin(fetchImpl)).toEqual({ kind: "not-admin" })
  })

  it("loads the agents for an admin", async () => {
    const agent = { id: "cloud-1", name: "Cloud" }
    const fetchImpl = routes(() => json({ authenticated: true }), () => json({ ok: true, agents: [agent] }))
    expect(await fetchCloudAgentsForAdmin(fetchImpl)).toEqual({ kind: "agents", agents: [agent] })
    expect(fetchImpl).toHaveBeenLastCalledWith("/api/admin/agents", { cache: "no-store" })
  })

  it("returns no agents when the list is missing or malformed", async () => {
    expect(await fetchCloudAgentsForAdmin(routes(() => json({ authenticated: true }), () => json({ ok: true })))).toEqual({ kind: "agents", agents: [] })
    expect(await fetchCloudAgentsForAdmin(routes(() => json({ authenticated: true }), () => new Response("x")))).toEqual({ kind: "agents", agents: [] })
  })

  it("stops when the session expired between the two calls", async () => {
    expect(await fetchCloudAgentsForAdmin(routes(() => json({ authenticated: true }), () => json({}, 401))))
      .toEqual({ kind: "not-admin" })
    expect(await fetchCloudAgentsForAdmin(routes(() => json({ authenticated: true }), () => json({}, 403))))
      .toEqual({ kind: "not-admin" })
  })

  it("reports server and network errors as unavailable, so polling can retry", async () => {
    expect(await fetchCloudAgentsForAdmin(routes(() => json({}, 503)))).toEqual({ kind: "unavailable" })
    expect(await fetchCloudAgentsForAdmin(routes(() => json({ authenticated: true }), () => json({}, 500)))).toEqual({ kind: "unavailable" })
    expect(await fetchCloudAgentsForAdmin(vi.fn(async () => { throw new TypeError("offline") }))).toEqual({ kind: "unavailable" })
  })

  it("uses the global fetch by default", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ authenticated: false }))
    try {
      expect(await fetchCloudAgentsForAdmin()).toEqual({ kind: "not-admin" })
      expect(spy).toHaveBeenCalledWith("/api/admin/session", { cache: "no-store" })
    } finally {
      spy.mockRestore()
    }
  })
})
