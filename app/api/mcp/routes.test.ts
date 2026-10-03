import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const rpcState = vi.hoisted(() => ({ current: null as unknown }))
const paidState = vi.hoisted(() => ({ fetch: null as unknown }))
vi.mock("@/lib/agent-wallet/chain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent-wallet/chain")>()),
  createWalletRpc: () => rpcState.current,
}))
vi.mock("@/lib/orchestration/wallet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orchestration/wallet")>()),
  createOrchestratorFetch: () => paidState.fetch,
}))

import { POST as mcpPost, GET as mcpGet, DELETE as mcpDelete, OPTIONS as mcpOptions } from "@/app/api/mcp/route"
import { GET as prmRoot, OPTIONS as prmOptions } from "@/app/.well-known/oauth-protected-resource/route"
import { GET as prmPath, OPTIONS as prmPathOptions } from "@/app/.well-known/oauth-protected-resource/api/mcp/route"
import { GET as asMeta, OPTIONS as asOptions } from "@/app/.well-known/oauth-authorization-server/route"
import { POST as register, OPTIONS as registerOptions } from "@/app/api/mcp/oauth/register/route"
import { POST as token, OPTIONS as tokenOptions } from "@/app/api/mcp/oauth/token/route"
import { POST as revoke, OPTIONS as revokeOptions } from "@/app/api/mcp/oauth/revoke/route"
import { POST as authorize } from "@/app/api/mcp/oauth/authorize/route"
import { GET as grantsGet, DELETE as grantsDelete } from "@/app/api/mcp/grants/route"
import { POST as approvalsPost } from "@/app/api/mcp/approvals/route"
import { AGENT_WALLET_COOKIE, agentWalletCookie, createAgentWallet } from "@/lib/agent-wallet/cookie"
import { BROWSER_ID_COOKIE, browserIdCookie } from "@/lib/identity/browser-id"
import { evaluateAuth, isMcpRoute } from "@/lib/auth/middleware"
import { createApproval, getApproval } from "@/lib/mcp/approvals"
import { createMemoryStore, setKvStoreForTests, type KvStore } from "@/lib/security/kv-store"
import { fakeWalletRpc } from "@/__tests__/helpers/fake-wallet-rpc"
import { ORIGIN, REDIRECT, UID, pkcePair } from "@/__tests__/helpers/mcp"

function cookieHeader(cookies: Array<{ name: string; value: string }>) {
  return cookies.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ")
}

function form(path: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, ...headers }, body: new URLSearchParams(fields).toString() })
}

function rpc(body: unknown, accessToken?: string) {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" }
  if (accessToken) headers.authorization = `Bearer ${accessToken}`
  return mcpPost(new Request(`${ORIGIN}/api/mcp`, { method: "POST", headers, body: JSON.stringify(body) }))
}

async function registerClient(): Promise<string> {
  const res = await register(new Request(`${ORIGIN}/api/mcp/oauth/register`, { method: "POST", body: JSON.stringify({ client_name: "Claude Code", redirect_uris: [REDIRECT] }) }))
  expect(res.status).toBe(201)
  return (await res.json()).client_id
}

function consentFields(clientId: string, challenge: string, extra: Record<string, string> = {}) {
  return {
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "xyz",
    scope: "agents:read agents:hire",
    resource: `${ORIGIN}/api/mcp`,
    ...extra,
  }
}

describe("MCP routes", () => {
  const env = { ...process.env }
  let store: KvStore
  beforeEach(async () => {
    delete process.env.CONNECTIONS_SECRET
    delete process.env.CONNECTIONS_SECRET_PREVIOUS
    delete process.env.MCP_PUBLIC_ORIGIN
    delete process.env.ORCHESTRATOR_X402_BASE_URL
    process.env.BETTER_AUTH_SECRET = "mcp-routes-secret"
    process.env.AI_GATEWAY_API_KEY = "gw-test-key-123"
    store = createMemoryStore()
    setKvStoreForTests(store)
    rpcState.current = (await fakeWalletRpc()).rpc
    paidState.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: "respuesta", receipt: { transaction: "sigABC" } })))
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    process.env = { ...env }
    setKvStoreForTests(null)
    vi.restoreAllMocks()
  })

  /** Consent in the browser (with or without cookies), then the code exchange. */
  async function connect(cookies = "") {
    const clientId = await registerClient()
    const { verifier, challenge } = pkcePair()
    const res = await authorize(form("/api/mcp/oauth/authorize", { ...consentFields(clientId, challenge), decision: "approve", cap: "0.05", team: JSON.stringify([{ id: "dev", name: "Dev", role: "Code" }]) }, cookies ? { cookie: cookies } : {}))
    expect(res.status).toBe(303)
    const location = new URL(res.headers.get("location") as string)
    expect(location.origin + location.pathname).toBe(REDIRECT)
    expect(location.searchParams.get("state")).toBe("xyz")
    expect(location.searchParams.get("iss")).toBe(ORIGIN)
    const code = location.searchParams.get("code") as string
    const tokenRes = await token(form("/api/mcp/oauth/token", { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: clientId }))
    expect(tokenRes.status).toBe(200)
    expect(tokenRes.headers.get("cache-control")).toBe("no-store")
    return { clientId, consent: res, tokens: await tokenRes.json() as { access_token: string; refresh_token: string; scope: string } }
  }

  it("publishes protected resource and authorization server metadata", async () => {
    const prm = await (await prmRoot(new Request(`${ORIGIN}/.well-known/oauth-protected-resource`))).json()
    expect(prm).toMatchObject({ resource: `${ORIGIN}/api/mcp`, authorization_servers: [ORIGIN], scopes_supported: ["agents:read", "agents:hire"] })
    expect(await (await prmPath(new Request(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`))).json()).toEqual(prm)
    const as = await (await asMeta(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`))).json()
    expect(as).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/mcp/authorize`,
      token_endpoint: `${ORIGIN}/api/mcp/oauth/token`,
      registration_endpoint: `${ORIGIN}/api/mcp/oauth/register`,
      code_challenge_methods_supported: ["S256"],
    })
    process.env.MCP_PUBLIC_ORIGIN = "https://agentic-city.vercel.app/"
    expect((await (await asMeta(new Request("http://internal:3000/.well-known/oauth-authorization-server"))).json()).issuer).toBe("https://agentic-city.vercel.app")
    for (const options of [prmOptions, prmPathOptions, asOptions, registerOptions, tokenOptions, revokeOptions, mcpOptions]) {
      const res = await options()
      expect(res.status).toBe(204)
      expect(res.headers.get("access-control-allow-origin")).toBe("*")
    }
  })

  it("registration validates its JSON", async () => {
    expect((await register(new Request(`${ORIGIN}/x`, { method: "POST", body: "not json" }))).status).toBe(400)
    expect((await register(new Request(`${ORIGIN}/x`, { method: "POST", body: "x".repeat(10_001) }))).status).toBe(400)
    const bad = await register(new Request(`${ORIGIN}/x`, { method: "POST", body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }) }))
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toBe("invalid_redirect_uri")
    setKvStoreForTests({ ...store, set: vi.fn().mockRejectedValue(new Error("down")) })
    expect((await register(new Request(`${ORIGIN}/x`, { method: "POST", body: JSON.stringify({ redirect_uris: [REDIRECT] }) }))).status).toBe(503)
  })

  it("an MCP request without a token gets 401 pointing to the metadata", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    expect(res.status).toBe(401)
    expect(res.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp", scope="agents:read agents:hire"`)
    const bad = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "acma_" + "x".repeat(43))
    expect(bad.status).toBe(401)
    expect(bad.headers.get("www-authenticate")).toContain('error="invalid_token"')
    expect((await mcpGet(new Request(`${ORIGIN}/api/mcp`))).status).toBe(401)
    expect((await mcpGet(new Request(`${ORIGIN}/api/mcp`, { headers: { authorization: "Bearer x" } }))).status).toBe(405)
    expect((await mcpDelete()).status).toBe(405)
  })

  it("the consent creates the browser's wallet and cookies, and the client can use the tools", async () => {
    const { consent, tokens } = await connect()
    const setCookies = consent.headers.getSetCookie().join("\n")
    expect(setCookies).toContain(`${AGENT_WALLET_COOKIE}=`)
    expect(setCookies).toContain(`${BROWSER_ID_COOKIE}=`)
    expect(tokens.scope).toBe("agents:read agents:hire")

    const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }, tokens.access_token)
    expect(init.status).toBe(200)
    expect((await init.json()).result.serverInfo.name).toBe("agentic-city")

    const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_agents", arguments: {} } }, tokens.access_token)
    const listed = JSON.parse((await list.json()).result.content[0].text)
    expect(listed.agents).toEqual([{ id: "dev", name: "Dev", role: "Code" }])

    const status = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "wallet_status", arguments: {} } }, tokens.access_token)
    const wallet = JSON.parse((await status.json()).result.content[0].text)
    expect(wallet.caps.thisClientPerDayUsdc).toBe("0.05")
    expect(wallet.balanceUsdc).toBe("0")

    // Empty wallet: the hire is refused before paying.
    const hire = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "hire_agent", arguments: { agentId: "dev", task: "hola" } } }, tokens.access_token)
    const hired = (await hire.json()).result
    expect(hired.isError).toBe(true)
    expect(hired.content[0].text).toContain(`${ORIGIN}/mcp`)
    expect(paidState.fetch).not.toHaveBeenCalled()
  })

  it("a funded wallet hires over MCP and returns the receipt", async () => {
    const wallet = await createAgentWallet(UID)
    rpcState.current = (await fakeWalletRpc({ balances: { [wallet.address]: BigInt(30_000) } })).rpc
    const { tokens } = await connect(cookieHeader([agentWalletCookie(wallet), browserIdCookie(UID)]))
    const hire = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "hire_agent", arguments: { agentId: "dev", task: "hola" } } }, tokens.access_token)
    const result = (await hire.json()).result
    expect(result.isError).toBeFalsy()
    expect(result.content[0].text).toContain("sigABC")
  })

  it("the consent refuses cross-site posts, and denial goes back to the client", async () => {
    const clientId = await registerClient()
    const { challenge } = pkcePair()
    const cross = await authorize(form("/api/mcp/oauth/authorize", { ...consentFields(clientId, challenge), decision: "approve" }, { origin: "https://evil.example" }))
    expect(cross.status).toBe(403)
    const denied = await authorize(form("/api/mcp/oauth/authorize", { ...consentFields(clientId, challenge), decision: "deny" }))
    expect(denied.status).toBe(303)
    expect(new URL(denied.headers.get("location") as string).searchParams.get("error")).toBe("access_denied")
    const unknown = await authorize(form("/api/mcp/oauth/authorize", { ...consentFields("mcpc_" + "z".repeat(43), challenge), decision: "approve" }))
    expect(unknown.status).toBe(400)
    expect(await unknown.text()).toContain("no está registrado")
    const badMethod = await authorize(form("/api/mcp/oauth/authorize", { ...consentFields(clientId, challenge, { code_challenge_method: "plain" }), decision: "approve" }))
    expect(new URL(badMethod.headers.get("location") as string).searchParams.get("error")).toBe("invalid_request")
  })

  it("the consent needs a sealing secret for the wallet", async () => {
    const clientId = await registerClient()
    delete process.env.BETTER_AUTH_SECRET
    const res = await authorize(form("/api/mcp/oauth/authorize", { ...consentFields(clientId, pkcePair().challenge), decision: "approve" }))
    expect(res.status).toBe(503)
  })

  it("token endpoint: refresh, unsupported grants, store errors", async () => {
    const { clientId, tokens } = await connect()
    const refreshed = await token(form("/api/mcp/oauth/token", { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId }))
    expect(refreshed.status).toBe(200)
    const reused = await token(new Request(`${ORIGIN}/api/mcp/oauth/token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId }) }))
    expect(reused.status).toBe(400)
    expect((await reused.json()).error).toBe("invalid_grant")
    expect((await token(form("/api/mcp/oauth/token", { grant_type: "password" }))).status).toBe(400)
    expect((await token(new Request(`${ORIGIN}/x`, { method: "POST", headers: { "content-type": "application/json" }, body: "{bad" }))).status).toBe(400)
    setKvStoreForTests({ ...store, get: vi.fn().mockRejectedValue(new Error("down")), set: vi.fn().mockRejectedValue(new Error("down")) })
    expect((await token(form("/api/mcp/oauth/token", { grant_type: "refresh_token", refresh_token: "acmr_" + "a".repeat(43), client_id: clientId }))).status).toBe(503)
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "acma_" + "a".repeat(43))).status).toBe(503)
  })

  it("revocation endpoint ends the connection", async () => {
    const { tokens } = await connect()
    expect((await revoke(form("/api/mcp/oauth/revoke", {}))).status).toBe(400)
    expect((await revoke(form("/api/mcp/oauth/revoke", { token: tokens.refresh_token }))).status).toBe(200)
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, tokens.access_token)).status).toBe(401)
    setKvStoreForTests({ ...store, get: vi.fn().mockRejectedValue(new Error("down")), del: vi.fn().mockRejectedValue(new Error("down")) })
    expect((await revoke(form("/api/mcp/oauth/revoke", { token: tokens.refresh_token }))).status).toBe(503)
  })

  it("the wallet panel lists and disconnects this browser's clients", async () => {
    const wallet = await createAgentWallet(UID)
    const cookies = cookieHeader([agentWalletCookie(wallet), browserIdCookie(UID)])
    const { tokens } = await connect(cookies)
    const listed = await (await grantsGet(new Request(`${ORIGIN}/api/mcp/grants`, { headers: { cookie: cookies } }))).json()
    expect(listed.clients).toHaveLength(1)
    expect(listed.clients[0]).toMatchObject({ clientName: "Claude Code", capUsdc: "0.05" })
    expect(JSON.stringify(listed)).not.toContain("wallet")

    expect((await grantsGet(new Request(`${ORIGIN}/api/mcp/grants`, { headers: { cookie: cookies, origin: "https://evil.example" } }))).status).toBe(403)
    expect(await (await grantsGet(new Request(`${ORIGIN}/api/mcp/grants`))).json()).toEqual({ ok: true, clients: [] })

    const del = (body: unknown, headers: Record<string, string>) => grantsDelete(new Request(`${ORIGIN}/api/mcp/grants`, { method: "DELETE", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }))
    expect((await del({ id: listed.clients[0].id }, { cookie: cookies })).status).toBe(403) // no Origin: not strict same-origin
    expect((await del({ id: listed.clients[0].id }, { origin: ORIGIN })).status).toBe(404) // no browser id
    expect((await del({ id: "f".repeat(32) }, { cookie: cookies, origin: ORIGIN })).status).toBe(404)
    expect((await del({ id: listed.clients[0].id }, { cookie: cookies, origin: ORIGIN })).status).toBe(200)
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, tokens.access_token)).status).toBe(401)

    setKvStoreForTests({ ...store, get: vi.fn().mockRejectedValue(new Error("down")) })
    expect((await grantsGet(new Request(`${ORIGIN}/api/mcp/grants`, { headers: { cookie: cookies } }))).status).toBe(503)
    expect((await del({ id: listed.clients[0].id }, { cookie: cookies, origin: ORIGIN })).status).toBe(503)
  })

  it("approvals are decided only from the owning browser, same-origin", async () => {
    const approval = await createApproval(store, { grantId: "g".repeat(32), uid: UID, clientName: "Claude Code", agentId: "dev", agentName: "Dev", amountMicro: 10_000, reason: "grant", capMicro: 10_000, task: "hola" })
    const mine = cookieHeader([browserIdCookie(UID)])
    const other = cookieHeader([browserIdCookie("b".repeat(32))])
    const location = (res: Response) => res.headers.get("location")
    expect(location(await approvalsPost(form("/api/mcp/approvals", { id: approval.id, decision: "approve" }, { cookie: mine, origin: "https://evil.example" })))).toContain("result=cross-site")
    expect(location(await approvalsPost(form("/api/mcp/approvals", { id: approval.id, decision: "approve" })))).toContain("result=not-yours")
    expect(location(await approvalsPost(form("/api/mcp/approvals", { id: approval.id, decision: "approve" }, { cookie: other })))).toContain("result=invalid")
    expect(location(await approvalsPost(form("/api/mcp/approvals", { id: approval.id, decision: "approve" }, { cookie: mine })))).toContain("result=approved")
    expect((await getApproval(store, approval.id))?.status).toBe("approved")
    expect(location(await approvalsPost(form("/api/mcp/approvals", { id: approval.id, decision: "reject" }, { cookie: mine })))).toContain("result=invalid")
    setKvStoreForTests({ ...store, get: vi.fn().mockRejectedValue(new Error("down")) })
    expect(location(await approvalsPost(form("/api/mcp/approvals", { id: approval.id, decision: "reject" }, { cookie: mine })))).toContain("result=unavailable")
  })

  it("the middleware lets MCP routes through without an API key, in their own rate bucket", async () => {
    expect(isMcpRoute("/api/mcp")).toBe(true)
    expect(isMcpRoute("/api/mcp/oauth/token")).toBe(true)
    expect(isMcpRoute("/api/mcpx")).toBe(false)
    const result = await evaluateAuth(new Request(`${ORIGIN}/api/mcp`, { method: "POST", headers: { authorization: "Bearer acma_whatever", "x-real-ip": "203.0.113.77" } }))
    expect(result.allowed).toBe(true)
    expect(result.headers?.["X-RateLimit-Limit"]).toBe("60")
    const preflightCheck = await evaluateAuth(new Request(`${ORIGIN}/api/mcp/oauth/register`, { method: "OPTIONS", headers: { "x-real-ip": "203.0.113.78" } }))
    expect(preflightCheck.allowed).toBe(true)
  })
})
