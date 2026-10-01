import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Keypair } from "@solana/web3.js"

const identity = vi.hoisted(() => ({ getIdentityStatus: vi.fn(), registerAgentIdentity: vi.fn(), prepareFeedback: vi.fn() }))
vi.mock("@/lib/solana/agent-identity", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/solana/agent-identity")>()), ...identity }))

import { GET as status } from "@/app/api/8004/agents/[id]/route"
import { GET as registration } from "@/app/api/8004/agents/[id]/registration.json/route"
import { POST as register } from "@/app/api/8004/agents/[id]/register/route"
import { POST as feedback } from "@/app/api/8004/agents/[id]/feedback/route"
import { IdentityError } from "@/lib/solana/agent-identity"
import { OPENROUTER_COOKIE } from "@/lib/connections/openrouter"
import { seal } from "@/lib/connections/sealed-cookie"

const ORIGIN = "https://agentic-city.test"
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const server = Keypair.fromSeed(new Uint8Array(32).fill(3))

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body: JSON.stringify(body) })
}

describe("8004 routes", () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "routes-test-secret"
    process.env.SOLANA_SERVER_SECRET = JSON.stringify(Array.from(server.secretKey))
    Object.values(identity).forEach((fn) => fn.mockReset())
  })
  afterEach(() => { process.env = { ...env } })

  it("GET status returns the identity or the error status", async () => {
    identity.getIdentityStatus.mockResolvedValue({ agentId: "a", asset: "A", registered: true, explorerUrl: "u", reputation: null })
    expect(await (await status(new Request(ORIGIN), ctx("a"))).json()).toMatchObject({ ok: true, registered: true })
    identity.getIdentityStatus.mockRejectedValue(new IdentityError("Agent identity is not configured on this server.", 503))
    expect((await status(new Request(ORIGIN), ctx("a"))).status).toBe(503)
    identity.getIdentityStatus.mockRejectedValue(new Error("rpc down"))
    expect((await status(new Request(ORIGIN), ctx("a"))).status).toBe(502)
  })

  it("serves the registration file with the derived asset", async () => {
    const res = await registration(new Request(`${ORIGIN}/api/8004/agents/a/registration.json?n=Bot&m=model`), ctx("a"))
    const data = await res.json()
    expect(data).toMatchObject({ name: "Bot", x402Support: true })
    expect(data.registrations[0].agentId).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    delete process.env.SOLANA_SERVER_SECRET
    expect((await (await registration(new Request(`${ORIGIN}/x`), ctx("a"))).json()).registrations).toEqual([])
  })

  it("register requires same origin and a connected account", async () => {
    expect((await register(post("/api/8004/agents/a/register", {}, { origin: "https://evil.test" }), ctx("a"))).status).toBe(403)
    expect((await register(post("/api/8004/agents/a/register", {}), ctx("a"))).status).toBe(401)
    expect(identity.registerAgentIdentity).not.toHaveBeenCalled()
  })

  it("register runs for a connected browser and maps treasury errors", async () => {
    const cookie = `${OPENROUTER_COOKIE}=${encodeURIComponent(seal({ key: "sk-or-v1-x", connectedAt: "now" }))}`
    identity.registerAgentIdentity.mockResolvedValue({ asset: "A", signature: "s", alreadyRegistered: false })
    const ok = await register(post("/api/8004/agents/a/register", { name: "Bot", model: "m", role: "r" }, { cookie }), ctx("a"))
    expect(await ok.json()).toMatchObject({ ok: true, asset: "A" })
    expect(identity.registerAgentIdentity.mock.calls[0][0]).toEqual({ id: "a", name: "Bot", role: "r", model: "m" })

    identity.registerAgentIdentity.mockResolvedValue({ asset: "A", signature: null, alreadyRegistered: true })
    expect((await register(post("/api/8004/agents/a/register", {}, { cookie }), ctx("a"))).status).toBe(200)

    identity.registerAgentIdentity.mockRejectedValue(new Error("Attempt to debit an account but found no record of a prior credit. insufficient lamports"))
    const broke = await register(post("/api/8004/agents/a/register", {}, { cookie }), ctx("a"))
    expect(broke.status).toBe(502)
    expect((await broke.json()).error).toContain("no devnet SOL")
    identity.registerAgentIdentity.mockRejectedValue(new IdentityError("not configured", 503))
    expect((await register(post("/api/8004/agents/a/register", {}, { cookie }), ctx("a"))).status).toBe(503)
  })

  it("feedback needs same origin and a payment, and returns the prepared transaction", async () => {
    expect((await feedback(post("/api/8004/agents/a/feedback", {}, { origin: "https://evil.test" }), ctx("a"))).status).toBe(403)
    expect((await feedback(post("/api/8004/agents/a/feedback", { score: 100 }), ctx("a"))).status).toBe(400)
    identity.prepareFeedback.mockResolvedValue({ transaction: "base64", asset: "A" })
    const ok = await feedback(post("/api/8004/agents/a/feedback", { score: 100, paymentSignature: "p", payer: "w" }), ctx("a"))
    expect(await ok.json()).toEqual({ ok: true, transaction: "base64", asset: "A" })
    identity.prepareFeedback.mockRejectedValue(new IdentityError("No x402 payment from this wallet to the agent was found.", 403))
    expect((await feedback(post("/api/8004/agents/a/feedback", { score: 100, paymentSignature: "p", payer: "w" }), ctx("a"))).status).toBe(403)
    identity.prepareFeedback.mockRejectedValue(new Error("rpc"))
    expect((await feedback(post("/api/8004/agents/a/feedback", { score: 100, paymentSignature: "p", payer: "w" }), ctx("a"))).status).toBe(502)
  })
})
