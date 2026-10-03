import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createAgentWallet } from "@/lib/agent-wallet/cookie"
import { MAX_GRANTS_PER_BROWSER, TTL } from "@/lib/mcp/config"
import {
  approveAuthorization,
  authenticateAccessToken,
  bearerToken,
  checkAuthorizeRequest,
  exchangeCode,
  getClient,
  getGrant,
  isAllowedRedirectUri,
  listGrants,
  openGrantSeed,
  redirectHost,
  refreshTokens,
  registerClient,
  revokeGrant,
  revokeToken,
} from "@/lib/mcp/oauth"
import { createMemoryStore, type KvStore } from "@/lib/security/kv-store"
import { ORIGIN, REDIRECT, UID, authorizeParams, connectGrant, newClient, pkcePair } from "@/__tests__/helpers/mcp"

describe("MCP OAuth", () => {
  const env = { ...process.env }
  let clock = Date.parse("2026-10-02T12:00:00Z")
  let store: KvStore
  beforeEach(() => {
    delete process.env.CONNECTIONS_SECRET
    delete process.env.CONNECTIONS_SECRET_PREVIOUS
    process.env.BETTER_AUTH_SECRET = "mcp-oauth-secret"
    clock = Date.parse("2026-10-02T12:00:00Z")
    store = createMemoryStore(() => clock)
  })
  afterEach(() => {
    process.env = { ...env }
  })
  const now = () => new Date(clock)

  describe("dynamic client registration", () => {
    it("registers a public client with its redirect URIs", async () => {
      const result = await registerClient(store, { client_name: "Cursor <script>", redirect_uris: [REDIRECT, "cursor://anysphere.cursor-mcp/oauth/callback"], token_endpoint_auth_method: "client_secret_basic", client_uri: "https://cursor.com" })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.client.client_id).toMatch(/^mcpc_/)
      expect(result.client.client_name).toBe("Cursor script")
      expect(result.client.token_endpoint_auth_method).toBe("none")
      expect(result.client.client_uri).toBe("https://cursor.com")
      expect(await getClient(store, result.client.client_id)).toEqual(result.client)
      expect(await getClient(store, "nope")).toBeNull()
    })

    it("refuses unsafe or missing redirect URIs and unsupported grants", async () => {
      expect((await registerClient(store, null)).ok).toBe(false)
      expect(await registerClient(store, { redirect_uris: [] })).toMatchObject({ ok: false, error: "invalid_redirect_uri" })
      expect(await registerClient(store, { redirect_uris: ["http://evil.example/cb"] })).toMatchObject({ ok: false, error: "invalid_redirect_uri" })
      expect(await registerClient(store, { redirect_uris: [REDIRECT], grant_types: ["client_credentials"] })).toMatchObject({ ok: false, error: "invalid_client_metadata" })
      expect(await registerClient(store, { redirect_uris: [REDIRECT], response_types: ["token"] })).toMatchObject({ ok: false, error: "invalid_client_metadata" })
      const unnamed = await registerClient(store, { redirect_uris: [REDIRECT] })
      expect(unnamed.ok && unnamed.client.client_name).toBe("Cliente MCP sin nombre")
    })

    it("allows https, loopback http and private-use schemes only", () => {
      expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true)
      expect(isAllowedRedirectUri("http://127.0.0.1:5555/cb")).toBe(true)
      expect(isAllowedRedirectUri("http://localhost/cb")).toBe(true)
      expect(isAllowedRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(true)
      expect(isAllowedRedirectUri("http://example.com/cb")).toBe(false)
      expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false)
      expect(isAllowedRedirectUri("data:text/html,hi")).toBe(false)
      expect(isAllowedRedirectUri("https://a.example/cb#frag")).toBe(false)
      expect(isAllowedRedirectUri("not a url")).toBe(false)
      expect(isAllowedRedirectUri(5)).toBe(false)
      expect(redirectHost("http://localhost:3333/cb")).toBe("http://localhost:3333")
      expect(redirectHost("cursor://anysphere.cursor-mcp/cb")).toBe("cursor://anysphere.cursor-mcp")
      expect(redirectHost("nope")).toBe("")
    })
  })

  describe("authorization request", () => {
    it("accepts a valid request and defaults scope and resource", async () => {
      const client = await newClient(store)
      const check = await checkAuthorizeRequest(store, authorizeParams(client, pkcePair().challenge), ORIGIN)
      expect(check.ok).toBe(true)
      if (!check.ok) return
      expect(check.request).toMatchObject({ clientId: client.client_id, redirectUri: REDIRECT, state: "st-1", scopes: ["agents:read", "agents:hire"], resource: `${ORIGIN}/api/mcp` })
    })

    it("shows errors for an unknown client or redirect, and redirects the others", async () => {
      const client = await newClient(store)
      const { challenge } = pkcePair()
      expect(await checkAuthorizeRequest(store, new URLSearchParams({ client_id: "mcpc_" + "x".repeat(43) }), ORIGIN)).toMatchObject({ ok: false, redirect: null, error: "invalid_client" })
      expect(await checkAuthorizeRequest(store, authorizeParams(client, challenge, { redirect_uri: "http://localhost:1/other" }), ORIGIN)).toMatchObject({ ok: false, redirect: null })

      const cases: Array<[Record<string, string>, string]> = [
        [{ response_type: "token" }, "unsupported_response_type"],
        [{ code_challenge: "short" }, "invalid_request"],
        [{ code_challenge_method: "plain" }, "invalid_request"],
        [{ scope: "admin:all" }, "invalid_scope"],
        [{ resource: "https://other.example/api/mcp" }, "invalid_target"],
      ]
      for (const [extra, error] of cases) {
        const check = await checkAuthorizeRequest(store, authorizeParams(client, challenge, extra), ORIGIN)
        expect(check.ok).toBe(false)
        if (check.ok) continue
        expect(check.error).toBe(error)
        const url = new URL(check.redirect as string)
        expect(url.origin + url.pathname).toBe(REDIRECT)
        expect(url.searchParams.get("error")).toBe(error)
        expect(url.searchParams.get("state")).toBe("st-1")
        expect(url.searchParams.get("iss")).toBe(ORIGIN)
      }
    })

    it("narrows scopes to the ones that exist", async () => {
      const client = await newClient(store)
      const check = await checkAuthorizeRequest(store, authorizeParams(client, pkcePair().challenge, { scope: "agents:read unknown" }), ORIGIN)
      expect(check.ok && check.request.scopes).toEqual(["agents:read"])
    })
  })

  describe("code exchange", () => {
    async function approved(options: { scope?: string } = {}) {
      const client = await newClient(store)
      const { verifier, challenge } = pkcePair()
      const check = await checkAuthorizeRequest(store, authorizeParams(client, challenge, options.scope ? { scope: options.scope } : {}), ORIGIN)
      if (!check.ok) throw new Error("bad request")
      const wallet = await createAgentWallet(UID)
      const { code, grant } = await approveAuthorization(store, { request: check.request, client, uid: UID, wallet, capMicro: 100_000, team: [] }, now())
      return { client, verifier, code, grant, wallet }
    }

    it("issues tokens once, with a verified PKCE verifier", async () => {
      const { client, verifier, code, grant, wallet } = await approved()
      expect((await getGrant(store, grant.id))?.active).toBe(false)
      expect(JSON.stringify(await getGrant(store, grant.id))).not.toContain(Buffer.from(wallet.seed).toString("base64url"))

      const result = await exchangeCode(store, { code, codeVerifier: verifier, redirectUri: REDIRECT, clientId: client.client_id }, ORIGIN, now())
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.body).toMatchObject({ token_type: "Bearer", expires_in: TTL.accessSeconds, scope: "agents:read agents:hire" })
      expect((await getGrant(store, grant.id))?.active).toBe(true)

      const auth = await authenticateAccessToken(store, result.body.access_token, ORIGIN, now())
      expect(auth.ok).toBe(true)
      if (!auth.ok) return
      expect(Array.from(openGrantSeed(auth.value) ?? [])).toEqual(Array.from(wallet.seed))
    })

    it("is single use: a second redemption fails and revokes the grant", async () => {
      const { client, verifier, code, grant } = await approved()
      const first = await exchangeCode(store, { code, codeVerifier: verifier, redirectUri: REDIRECT, clientId: client.client_id }, ORIGIN, now())
      expect(first.ok).toBe(true)
      const second = await exchangeCode(store, { code, codeVerifier: verifier, redirectUri: REDIRECT, clientId: client.client_id }, ORIGIN, now())
      expect(second).toMatchObject({ ok: false, error: "invalid_grant" })
      expect(await getGrant(store, grant.id)).toBeNull()
      if (first.ok) expect((await authenticateAccessToken(store, first.body.access_token, ORIGIN, now())).ok).toBe(false)
    })

    it("rejects a wrong verifier, client, redirect, resource or an expired code", async () => {
      const a = await approved()
      expect(await exchangeCode(store, { code: a.code, codeVerifier: pkcePair().verifier, redirectUri: REDIRECT, clientId: a.client.client_id }, ORIGIN, now())).toMatchObject({ ok: false, error_description: "PKCE verification failed." })
      const b = await approved()
      expect(await exchangeCode(store, { code: b.code, codeVerifier: b.verifier, redirectUri: REDIRECT, clientId: a.client.client_id }, ORIGIN, now())).toMatchObject({ ok: false, error: "invalid_grant" })
      const c = await approved()
      expect(await exchangeCode(store, { code: c.code, codeVerifier: c.verifier, redirectUri: "http://localhost:1/x", clientId: c.client.client_id }, ORIGIN, now())).toMatchObject({ ok: false, error: "invalid_grant" })
      const d = await approved()
      expect(await exchangeCode(store, { code: d.code, codeVerifier: d.verifier, redirectUri: REDIRECT, clientId: d.client.client_id, resource: "https://x.example/api/mcp" }, ORIGIN, now())).toMatchObject({ ok: false, error: "invalid_target" })
      const e = await approved()
      clock += (TTL.codeSeconds + 1) * 1000
      expect(await exchangeCode(store, { code: e.code, codeVerifier: e.verifier, redirectUri: REDIRECT, clientId: e.client.client_id }, ORIGIN, now())).toMatchObject({ ok: false, error: "invalid_grant" })
      expect(await exchangeCode(store, { code: "nope", codeVerifier: "x", redirectUri: REDIRECT, clientId: "c" }, ORIGIN, now())).toMatchObject({ ok: false, error: "invalid_grant" })
    })

    it("an abandoned approval disappears with its code", async () => {
      const { grant } = await approved()
      clock += (TTL.codeSeconds + 61) * 1000
      expect(await getGrant(store, grant.id)).toBeNull()
    })
  })

  describe("access and refresh tokens", () => {
    it("access tokens expire", async () => {
      const { tokens } = await connectGrant(store, { now: now() })
      expect((await authenticateAccessToken(store, tokens.access_token, ORIGIN, now())).ok).toBe(true)
      clock += (TTL.accessSeconds + 1) * 1000
      expect(await authenticateAccessToken(store, tokens.access_token, ORIGIN, now())).toMatchObject({ ok: false, error: "invalid_token" })
    })

    it("rejects missing, malformed, foreign-resource and refresh tokens as access tokens", async () => {
      const { tokens } = await connectGrant(store, { now: now() })
      expect((await authenticateAccessToken(store, null, ORIGIN, now())).ok).toBe(false)
      expect((await authenticateAccessToken(store, "acma_bad", ORIGIN, now())).ok).toBe(false)
      expect((await authenticateAccessToken(store, tokens.refresh_token, ORIGIN, now())).ok).toBe(false)
      expect((await authenticateAccessToken(store, tokens.access_token, "https://other.example", now())).ok).toBe(false)
    })

    it("refresh rotates both tokens and keeps the wallet usable", async () => {
      const { client, tokens, wallet } = await connectGrant(store, { now: now() })
      clock += 2 * 60 * 60 * 1000 // the access token has expired by now
      const refreshed = await refreshTokens(store, { refreshToken: tokens.refresh_token, clientId: client.client_id }, now())
      expect(refreshed.ok).toBe(true)
      if (!refreshed.ok) return
      expect(refreshed.body.refresh_token).not.toBe(tokens.refresh_token)
      const auth = await authenticateAccessToken(store, refreshed.body.access_token, ORIGIN, now())
      expect(auth.ok && Array.from(openGrantSeed(auth.value) ?? [])).toEqual(Array.from(wallet.seed))
    })

    it("a reused refresh token revokes the whole grant", async () => {
      const { client, tokens, grant } = await connectGrant(store, { now: now() })
      const refreshed = await refreshTokens(store, { refreshToken: tokens.refresh_token, clientId: client.client_id }, now())
      expect(refreshed.ok).toBe(true)
      const replay = await refreshTokens(store, { refreshToken: tokens.refresh_token, clientId: client.client_id }, now())
      expect(replay).toMatchObject({ ok: false, error: "invalid_grant" })
      expect(await getGrant(store, grant.id)).toBeNull()
      if (refreshed.ok) expect((await authenticateAccessToken(store, refreshed.body.access_token, ORIGIN, now())).ok).toBe(false)
    })

    it("refresh checks the client and cannot widen scopes, but can narrow them", async () => {
      const a = await connectGrant(store, { now: now(), scope: "agents:read" })
      expect(await refreshTokens(store, { refreshToken: a.tokens.refresh_token, clientId: "mcpc_other" }, now())).toMatchObject({ ok: false, error: "invalid_grant" })
      const b = await connectGrant(store, { now: now(), scope: "agents:read" })
      expect(await refreshTokens(store, { refreshToken: b.tokens.refresh_token, clientId: b.client.client_id, scope: "agents:read agents:hire" }, now())).toMatchObject({ ok: false, error: "invalid_scope" })
      const c = await connectGrant(store, { now: now() })
      const narrowed = await refreshTokens(store, { refreshToken: c.tokens.refresh_token, clientId: c.client.client_id, scope: "agents:read" }, now())
      expect(narrowed.ok && narrowed.body.scope).toBe("agents:read")
      expect(await refreshTokens(store, { refreshToken: "x", clientId: c.client.client_id }, now())).toMatchObject({ ok: false })
    })

    it("refresh tokens expire", async () => {
      const { client, tokens } = await connectGrant(store, { now: now() })
      clock += (TTL.refreshSeconds + 1) * 1000
      expect(await refreshTokens(store, { refreshToken: tokens.refresh_token, clientId: client.client_id }, now())).toMatchObject({ ok: false, error: "invalid_grant" })
    })
  })

  describe("revocation", () => {
    it("revoking an access token ends only that token", async () => {
      const { client, tokens } = await connectGrant(store, { now: now() })
      await revokeToken(store, tokens.access_token)
      expect((await authenticateAccessToken(store, tokens.access_token, ORIGIN, now())).ok).toBe(false)
      expect((await refreshTokens(store, { refreshToken: tokens.refresh_token, clientId: client.client_id }, now())).ok).toBe(true)
      await revokeToken(store, "whatever") // unknown tokens are ignored
    })

    it("revoking a refresh token ends the grant and deletes the wallet copy", async () => {
      const { tokens, grant } = await connectGrant(store, { now: now() })
      await revokeToken(store, tokens.refresh_token)
      expect(await getGrant(store, grant.id)).toBeNull()
      expect((await authenticateAccessToken(store, tokens.access_token, ORIGIN, now())).ok).toBe(false)
    })

    it("the browser lists and revokes only its own grants", async () => {
      const mine = await connectGrant(store, { now: now() })
      await connectGrant(store, { now: now(), uid: "b".repeat(32) })
      const list = await listGrants(store, UID)
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ id: mine.grant.id, clientName: "Claude Code", redirectHost: "http://localhost:33418", capMicro: 100_000 })
      expect(await revokeGrant(store, mine.grant.id, "b".repeat(32))).toBe(false)
      expect(await revokeGrant(store, mine.grant.id, UID)).toBe(true)
      expect(await listGrants(store, UID)).toEqual([])
      expect((await authenticateAccessToken(store, mine.tokens.access_token, ORIGIN, now())).ok).toBe(false)
      expect(await revokeGrant(store, "nope")).toBe(false)
    })

    it("keeps at most a few connections per browser, revoking the oldest", async () => {
      const first = await connectGrant(store, { now: now() })
      for (let i = 0; i < MAX_GRANTS_PER_BROWSER; i++) await connectGrant(store, { now: now() })
      const list = await listGrants(store, UID)
      expect(list).toHaveLength(MAX_GRANTS_PER_BROWSER)
      expect(list.some((grant) => grant.id === first.grant.id)).toBe(false)
    })
  })

  it("reads bearer tokens from the Authorization header", () => {
    expect(bearerToken(new Request(ORIGIN, { headers: { authorization: "Bearer abc" } }))).toBe("abc")
    expect(bearerToken(new Request(ORIGIN, { headers: { authorization: "Basic abc" } }))).toBeNull()
    expect(bearerToken(new Request(ORIGIN))).toBeNull()
  })
})
