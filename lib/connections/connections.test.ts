import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isSealingConfigured, readCookie, seal, unseal } from "@/lib/connections/sealed-cookie"
import {
  OPENROUTER_COOKIE,
  OPENROUTER_PKCE_COOKIE,
  buildAuthorizeUrl,
  createPkce,
  exchangeCode,
  readOpenRouterConnection,
  safeReturnTo,
  sealPkce,
} from "@/lib/connections/openrouter"
import { withOAuthCredentials } from "@/lib/connections/hydrate"
import { GET as start } from "@/app/api/connections/openrouter/start/route"
import { GET as callback } from "@/app/api/connections/openrouter/callback/route"
import { DELETE as disconnect, GET as status } from "@/app/api/connections/openrouter/route"

const ORIGIN = "https://agentic-city.test"

function withCookies(path: string, cookies: Record<string, string>, init: RequestInit = {}) {
  const cookie = Object.entries(cookies).map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ")
  return new Request(`${ORIGIN}${path}`, { ...init, headers: { cookie, ...(init.headers as Record<string, string> | undefined) } })
}

describe("sealed cookies", () => {
  const original = { secret: process.env.BETTER_AUTH_SECRET, connections: process.env.CONNECTIONS_SECRET }
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret-for-sealing"
    delete process.env.CONNECTIONS_SECRET
  })
  afterEach(() => {
    if (original.secret === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = original.secret
    if (original.connections !== undefined) process.env.CONNECTIONS_SECRET = original.connections
  })

  it("round-trips a payload and keeps it unreadable", () => {
    const token = seal({ key: "sk-or-secret-value" })
    expect(token).not.toContain("sk-or-secret-value")
    expect(unseal(token)).toEqual({ key: "sk-or-secret-value" })
  })

  it("rejects tampered, short, empty or foreign tokens", () => {
    const token = seal({ a: 1 })
    const flipped = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA")
    expect(unseal(flipped)).toBeNull()
    expect(unseal("short")).toBeNull()
    expect(unseal(null)).toBeNull()
    process.env.BETTER_AUTH_SECRET = "another-secret"
    expect(unseal(token)).toBeNull()
  })

  it("reports whether a secret is configured and refuses to seal without one", () => {
    expect(isSealingConfigured()).toBe(true)
    delete process.env.BETTER_AUTH_SECRET
    expect(isSealingConfigured()).toBe(false)
    expect(() => seal({})).toThrow("BETTER_AUTH_SECRET")
  })

  it("reads a cookie by name and ignores malformed encodings", () => {
    const req = new Request(ORIGIN, { headers: { cookie: "a=1; b=hello%20world; c=%E0%A4%A" } })
    expect(readCookie(req, "b")).toBe("hello world")
    expect(readCookie(req, "missing")).toBeNull()
    expect(readCookie(req, "c")).toBeNull()
  })
})

describe("OpenRouter OAuth", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret-for-openrouter"
  })
  afterEach(() => vi.unstubAllGlobals())

  it("builds a PKCE authorize URL with a callback on this origin", () => {
    const { verifier, challenge, state } = createPkce()
    expect(verifier).not.toBe(challenge)
    const url = new URL(buildAuthorizeUrl(ORIGIN, challenge, state))
    expect(url.origin + url.pathname).toBe("https://openrouter.ai/auth")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("code_challenge")).toBe(challenge)
    const cb = new URL(url.searchParams.get("callback_url")!)
    expect(cb.origin).toBe(ORIGIN)
    expect(cb.searchParams.get("state")).toBe(state)
  })

  it("only allows same-site return paths", () => {
    expect(safeReturnTo("/?tab=models")).toBe("/?tab=models")
    expect(safeReturnTo("https://evil.test")).toBe("/")
    expect(safeReturnTo("//evil.test")).toBe("/")
    expect(safeReturnTo("/\\evil")).toBe("/")
    expect(safeReturnTo(null)).toBe("/")
  })

  it("exchanges the code for a key and reports failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ key: "sk-or-v1-user-key" }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(exchangeCode("code-1", "verifier-1")).resolves.toBe("sk-or-v1-user-key")
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/auth/keys")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ code: "code-1", code_verifier: "verifier-1", code_challenge_method: "S256" })

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 400 })))
    await expect(exchangeCode("c", "v")).rejects.toThrow("HTTP 400")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })))
    await expect(exchangeCode("c", "v")).rejects.toThrow("did not return a key")
  })

  it("start redirects to OpenRouter and stores the verifier in an httpOnly cookie", async () => {
    const res = await start(new Request(`${ORIGIN}/api/connections/openrouter/start?returnTo=%2F%3Ftab%3Dmodels`))
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toContain("https://openrouter.ai/auth?")
    const cookie = res.headers.get("set-cookie") ?? ""
    expect(cookie).toContain(`${OPENROUTER_PKCE_COOKIE}=`)
    expect(cookie.toLowerCase()).toContain("httponly")
  })

  it("start answers 503 when no secret is configured", async () => {
    delete process.env.BETTER_AUTH_SECRET
    const res = await start(new Request(`${ORIGIN}/api/connections/openrouter/start`))
    expect(res.status).toBe(503)
  })

  it("callback stores the key encrypted and returns to the app", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ key: "sk-or-v1-user-key" }), { status: 200 })))
    const pkce = sealPkce({ verifier: "v", state: "s1", returnTo: "/?tab=models" })
    const res = await callback(withCookies("/api/connections/openrouter/callback?code=abc&state=s1", { [OPENROUTER_PKCE_COOKIE]: pkce }))

    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?tab=models&openrouter=connected`)
    const cookies = res.headers.getSetCookie()
    const stored = cookies.find((c) => c.startsWith(`${OPENROUTER_COOKIE}=`))!
    expect(stored).not.toContain("sk-or-v1-user-key")
    const value = decodeURIComponent(stored.split(";")[0].slice(OPENROUTER_COOKIE.length + 1))
    expect(readOpenRouterConnection(withCookies("/", { [OPENROUTER_COOKIE]: value }))?.key).toBe("sk-or-v1-user-key")
  })

  it("callback rejects a wrong state, a missing code and exchange failures", async () => {
    const pkce = sealPkce({ verifier: "v", state: "s1", returnTo: "/" })
    const wrong = await callback(withCookies("/api/connections/openrouter/callback?code=abc&state=other", { [OPENROUTER_PKCE_COOKIE]: pkce }))
    expect(wrong.headers.get("location")).toContain("openrouter=error")
    const none = await callback(new Request(`${ORIGIN}/api/connections/openrouter/callback?code=abc&state=s1`))
    expect(none.headers.get("location")).toContain("openrouter=error")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })))
    const failed = await callback(withCookies("/api/connections/openrouter/callback?code=abc&state=s1", { [OPENROUTER_PKCE_COOKIE]: pkce }))
    expect(failed.headers.get("location")).toContain("openrouter=error")
  })

  it("status never reveals the key, and disconnect clears the cookie", async () => {
    const value = seal({ key: "sk-or-v1-user-key", connectedAt: "2026-09-30T00:00:00.000Z" })
    const res = await status(withCookies("/api/connections/openrouter", { [OPENROUTER_COOKIE]: value }))
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ connected: true, connectedAt: "2026-09-30T00:00:00.000Z" })
    expect(text).not.toContain("sk-or")
    expect(await (await status(new Request(`${ORIGIN}/api/connections/openrouter`))).json()).toEqual({ connected: false, connectedAt: null })

    const out = await disconnect(new Request(`${ORIGIN}/api/connections/openrouter`, { method: "DELETE" }))
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0")
  })
})

describe("withOAuthCredentials", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret-for-hydrate"
  })

  const cookie = () => ({ [OPENROUTER_COOKIE]: seal({ key: "sk-or-v1-user-key", connectedAt: "now" }) })
  const body = {
    message: "hola",
    orchestrator: { connection: { provider: "openrouter", model: "x-ai/grok-4", apiKey: "", auth: "oauth" } },
    members: [{ id: "a", connection: { provider: "openrouter", model: "anthropic/claude", apiKey: "", auth: "oauth" } }, { id: "b", connection: { provider: "openai", model: "m", apiKey: "sk-own-key-123" } }],
  }

  it("fills in the key for login-based connections on same-origin requests", async () => {
    const req = withCookies("/api/connections/chat", cookie(), { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) })
    const out = await withOAuthCredentials(req)
    expect(out).toBeInstanceOf(Request)
    const hydrated = await (out as Request).json()
    expect(hydrated.orchestrator.connection).toEqual({ provider: "openrouter", model: "x-ai/grok-4", apiKey: "sk-or-v1-user-key" })
    expect(hydrated.members[0].connection.apiKey).toBe("sk-or-v1-user-key")
    expect(hydrated.members[1].connection.apiKey).toBe("sk-own-key-123")
  })

  it("fills the connection of a single paid agent", async () => {
    const req = withCookies("/api/x402/agents/a/task", cookie(), { method: "POST", headers: { origin: ORIGIN }, body: JSON.stringify({ task: "t", agent: { connection: { provider: "openrouter", model: "m", apiKey: "", auth: "oauth" } } }) })
    const hydrated = await (await withOAuthCredentials(req) as Request).json()
    expect(hydrated.agent.connection).toEqual({ provider: "openrouter", model: "m", apiKey: "sk-or-v1-user-key" })
  })

  it("fills a top-level connection (connection test)", async () => {
    const req = withCookies("/api/connections/test", cookie(), { method: "POST", headers: { "sec-fetch-site": "same-origin" }, body: JSON.stringify({ kind: "model", provider: "openrouter", model: "m", auth: "oauth" }) })
    const hydrated = await (await withOAuthCredentials(req) as Request).json()
    expect(hydrated).toEqual({ kind: "model", provider: "openrouter", model: "m", apiKey: "sk-or-v1-user-key" })
  })

  it("refuses cross-site requests, missing connections and other providers", async () => {
    const cross = await withOAuthCredentials(withCookies("/api/connections/chat", cookie(), { method: "POST", headers: { origin: "https://evil.test" }, body: JSON.stringify(body) }))
    expect((cross as Response).status).toBe(403)
    const bad = await withOAuthCredentials(withCookies("/api/connections/chat", cookie(), { method: "POST", headers: { origin: "not a url" }, body: JSON.stringify(body) }))
    expect((bad as Response).status).toBe(403)

    const missing = await withOAuthCredentials(new Request(`${ORIGIN}/api/connections/chat`, { method: "POST", headers: { origin: ORIGIN }, body: JSON.stringify(body) }))
    expect((missing as Response).status).toBe(401)

    const other = await withOAuthCredentials(withCookies("/api/connections/test", cookie(), { method: "POST", headers: { origin: ORIGIN }, body: JSON.stringify({ provider: "openai", auth: "oauth" }) }))
    expect((other as Response).status).toBe(400)
  })

  it("passes through bodies without login-based connections, and non-JSON bodies", async () => {
    const plain = await withOAuthCredentials(new Request(`${ORIGIN}/x`, { method: "POST", body: JSON.stringify({ a: 1 }) }))
    expect(await (plain as Request).json()).toEqual({ a: 1 })
    const text = await withOAuthCredentials(new Request(`${ORIGIN}/x`, { method: "POST", body: "not json" }))
    expect(await (text as Request).text()).toBe("not json")
    const scalar = await withOAuthCredentials(new Request(`${ORIGIN}/x`, { method: "POST", body: "7" }))
    expect(await (scalar as Request).text()).toBe("7")
  })
})

describe("rate limit exemptions", () => {
  it("exempts only the account and connection status reads", async () => {
    const { isRateLimitExempt } = await import("@/lib/auth/middleware")
    expect(isRateLimitExempt("/api/account", "GET")).toBe(true)
    expect(isRateLimitExempt("/api/connections/openrouter", "GET")).toBe(true)
    expect(isRateLimitExempt("/api/auth/get-session", "GET")).toBe(true)
    expect(isRateLimitExempt("/api/connections/openrouter", "DELETE")).toBe(false)
    expect(isRateLimitExempt("/api/connections/chat", "POST")).toBe(false)
    expect(isRateLimitExempt("/api/feed", "GET")).toBe(false)
  })
})
