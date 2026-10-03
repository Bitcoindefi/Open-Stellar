import type { AgentWalletRecord } from "@/lib/agent-wallet/cookie"
import type { KvStore } from "@/lib/security/kv-store"
import { MAX_GRANTS_PER_BROWSER, TTL, parseScopes, resourceUrl, type McpScope } from "@/lib/mcp/config"
import {
  isCodeChallenge,
  isTokenOf,
  newDataKey,
  newId,
  newToken,
  openSeed,
  sealSeed,
  tokenHash,
  unwrapDataKey,
  verifyPkce,
  wrapDataKey,
  type Sealed,
} from "@/lib/mcp/crypto"
import type { McpAgent } from "@/lib/mcp/roster"

// The OAuth 2.1 authorization server behind the MCP endpoint, on top of the shared KV store:
// dynamic client registration (RFC 7591), authorization code + PKCE S256, rotating refresh
// tokens, revocation (RFC 7009). Every token is opaque and stored only as a hash. Failures come
// back as OAuth error objects, never as exceptions, except when the store itself is down.

export type OAuthError = { ok: false; status: number; error: string; error_description: string }

function oauthError(error: string, description: string, status = 400): OAuthError {
  return { ok: false, status, error, error_description: description }
}

export type McpClient = {
  client_id: string
  client_name: string
  redirect_uris: string[]
  grant_types: string[]
  response_types: string[]
  token_endpoint_auth_method: "none"
  client_id_issued_at: number
  client_uri?: string
}

export type Grant = {
  v: 1
  id: string
  /** The browser id (ac_uid) that approved this client. */
  uid: string
  clientId: string
  clientName: string
  redirectHost: string
  scopes: McpScope[]
  /** What this client may spend per UTC day, in micro-USDC. */
  capMicro: number
  /** The agents' wallet address the encrypted seed belongs to. */
  address: string
  /** Snapshot of the person's team at consent (names and roles only). */
  team: McpAgent[]
  /** The wallet seed, encrypted under the grant's data key (see lib/mcp/crypto.ts). */
  wallet: Sealed
  active: boolean
  createdAt: string
  refreshedAt: string
}

type CodeRecord = { grantId: string; clientId: string; redirectUri: string; challenge: string; scopes: McpScope[]; resource: string; exp: number; wrapped: Sealed }
type TokenRecord = { grantId: string; clientId: string; scopes: McpScope[]; resource: string; exp: number; wrapped: Sealed }

const KEY = {
  client: (id: string) => `mcp:client:${id}`,
  grant: (id: string) => `mcp:grant:${id}`,
  index: (uid: string) => `mcp:grants:${uid}`,
  code: (hash: string) => `mcp:code:${hash}`,
  codeUsed: (hash: string) => `mcp:code-used:${hash}`,
  access: (hash: string) => `mcp:at:${hash}`,
  refresh: (hash: string) => `mcp:rt:${hash}`,
  refreshUsed: (hash: string) => `mcp:rt-used:${hash}`,
}

async function readJson<T>(store: KvStore, key: string): Promise<T | null> {
  const raw = await store.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function writeJson(store: KvStore, key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await store.set(key, JSON.stringify(value), ttlSeconds)
}

const nowSeconds = (now: Date) => Math.floor(now.getTime() / 1000)

// ---------------------------------------------------------------- client registration

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])
const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"])

/** https anywhere, http only on loopback (RFC 8252), or a private-use scheme such as cursor://. */
export function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.hash) return false
  if (url.protocol === "https:") return true
  if (url.protocol === "http:") return LOOPBACK.has(url.hostname)
  if (BLOCKED_SCHEMES.has(url.protocol)) return false
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol)
}

function cleanName(value: unknown): string {
  const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim() : ""
  return text.slice(0, 80)
}

export async function registerClient(store: KvStore, body: unknown, now: Date = new Date()): Promise<{ ok: true; client: McpClient } | OAuthError> {
  if (!body || typeof body !== "object") return oauthError("invalid_client_metadata", "Send the client metadata as a JSON object.")
  const meta = body as Record<string, unknown>
  const redirects = meta.redirect_uris
  if (!Array.isArray(redirects) || redirects.length === 0 || redirects.length > 10) {
    return oauthError("invalid_redirect_uri", "redirect_uris must list between 1 and 10 URIs.")
  }
  if (!redirects.every(isAllowedRedirectUri)) {
    return oauthError("invalid_redirect_uri", "Each redirect URI must be https, http on localhost, or a private-use scheme, without a fragment.")
  }
  const grantTypes = Array.isArray(meta.grant_types) ? meta.grant_types.map(String) : ["authorization_code", "refresh_token"]
  if (!grantTypes.includes("authorization_code") || grantTypes.some((type) => type !== "authorization_code" && type !== "refresh_token")) {
    return oauthError("invalid_client_metadata", "Only the authorization_code and refresh_token grants are supported.")
  }
  const responseTypes = Array.isArray(meta.response_types) ? meta.response_types.map(String) : ["code"]
  if (responseTypes.some((type) => type !== "code")) return oauthError("invalid_client_metadata", "Only response_type code is supported.")

  const client: McpClient = {
    client_id: newToken("client"),
    client_name: cleanName(meta.client_name) || "Cliente MCP sin nombre",
    redirect_uris: redirects as string[],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    // Public clients only: a desktop or CLI client cannot keep a secret, PKCE protects the code.
    token_endpoint_auth_method: "none",
    client_id_issued_at: nowSeconds(now),
  }
  if (typeof meta.client_uri === "string" && /^https:\/\//.test(meta.client_uri) && meta.client_uri.length <= 300) client.client_uri = meta.client_uri
  await writeJson(store, KEY.client(client.client_id), client, TTL.clientSeconds)
  return { ok: true, client }
}

export async function getClient(store: KvStore, clientId: unknown): Promise<McpClient | null> {
  if (typeof clientId !== "string" || !/^mcpc_[A-Za-z0-9_-]{43}$/.test(clientId)) return null
  return readJson<McpClient>(store, KEY.client(clientId))
}

// ---------------------------------------------------------------- authorization request

export type AuthorizeRequest = {
  clientId: string
  redirectUri: string
  state: string | null
  codeChallenge: string
  scopes: McpScope[]
  resource: string
}

export type AuthorizeCheck =
  | { ok: true; request: AuthorizeRequest; client: McpClient }
  /** `redirect` is set when the error may be sent back to the client's redirect URI. */
  | { ok: false; error: string; description: string; redirect: string | null }

export function errorRedirect(redirectUri: string, error: string, description: string, state: string | null, issuer: string): string {
  const url = new URL(redirectUri)
  url.searchParams.set("error", error)
  url.searchParams.set("error_description", description)
  if (state) url.searchParams.set("state", state)
  url.searchParams.set("iss", issuer)
  return url.toString()
}

function sameResource(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "")
}

/** Validates an authorization request. Client and redirect URI first: until they check out, errors are shown, not redirected. */
export async function checkAuthorizeRequest(store: KvStore, params: URLSearchParams, origin: string): Promise<AuthorizeCheck> {
  const client = await getClient(store, params.get("client_id"))
  if (!client) return { ok: false, error: "invalid_client", description: "Este cliente MCP no está registrado (o su registro venció). Volvé a conectarlo desde tu cliente.", redirect: null }
  const redirectUri = params.get("redirect_uri") ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : "")
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
    return { ok: false, error: "invalid_request", description: "La dirección de retorno no coincide con la que registró el cliente.", redirect: null }
  }
  const state = params.get("state")
  const fail = (error: string, description: string): AuthorizeCheck => ({ ok: false, error, description, redirect: errorRedirect(redirectUri, error, description, state, origin) })
  if (params.get("response_type") !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.")
  const challenge = params.get("code_challenge")
  if (!isCodeChallenge(challenge)) return fail("invalid_request", "PKCE is required: send a code_challenge (S256).")
  if (params.get("code_challenge_method") !== "S256") return fail("invalid_request", "Only code_challenge_method=S256 is supported.")
  const scopes = parseScopes(params.get("scope"))
  if (!scopes) return fail("invalid_scope", "None of the requested scopes exist here.")
  const resource = params.get("resource") ?? resourceUrl(origin)
  if (!sameResource(resource, resourceUrl(origin))) return fail("invalid_target", "This server only issues tokens for its own MCP endpoint.")
  return { ok: true, client, request: { clientId: client.client_id, redirectUri, state, codeChallenge: challenge, scopes, resource: resourceUrl(origin) } }
}

// ---------------------------------------------------------------- grants and codes

/**
 * The person approved: stores the grant (with an encrypted copy of the wallet seed) and returns
 * a single-use authorization code. The grant stays inactive, and expires with the code, until
 * the client exchanges it.
 */
export async function approveAuthorization(
  store: KvStore,
  input: { request: AuthorizeRequest; client: McpClient; uid: string; wallet: AgentWalletRecord; capMicro: number; team: McpAgent[] },
  now: Date = new Date(),
): Promise<{ code: string; grant: Grant }> {
  const grantId = newId()
  const dataKey = newDataKey()
  const iso = now.toISOString()
  const grant: Grant = {
    v: 1,
    id: grantId,
    uid: input.uid,
    clientId: input.client.client_id,
    clientName: input.client.client_name,
    redirectHost: redirectHost(input.request.redirectUri),
    scopes: input.request.scopes,
    capMicro: input.capMicro,
    address: input.wallet.address,
    team: input.team,
    wallet: sealSeed(dataKey, input.wallet.seed, grantId, input.wallet.address),
    active: false,
    createdAt: iso,
    refreshedAt: iso,
  }
  const code = newToken("code")
  const record: CodeRecord = {
    grantId,
    clientId: input.client.client_id,
    redirectUri: input.request.redirectUri,
    challenge: input.request.codeChallenge,
    scopes: input.request.scopes,
    resource: input.request.resource,
    exp: nowSeconds(now) + TTL.codeSeconds,
    wrapped: wrapDataKey(dataKey, code, grantId, "code"),
  }
  await writeJson(store, KEY.grant(grantId), grant, TTL.codeSeconds + 60)
  await writeJson(store, KEY.code(tokenHash(code)), record, TTL.codeSeconds)
  dataKey.fill(0)
  return { code, grant }
}

export function redirectHost(uri: string): string {
  try {
    const url = new URL(uri)
    return url.host ? `${url.protocol}//${url.host}` : url.protocol
  } catch {
    return ""
  }
}

export function successRedirect(redirectUri: string, code: string, state: string | null, issuer: string): string {
  const url = new URL(redirectUri)
  url.searchParams.set("code", code)
  if (state) url.searchParams.set("state", state)
  url.searchParams.set("iss", issuer)
  return url.toString()
}

export async function getGrant(store: KvStore, grantId: string): Promise<Grant | null> {
  if (!/^[0-9a-f]{32}$/.test(grantId)) return null
  const grant = await readJson<Grant>(store, KEY.grant(grantId))
  return grant?.v === 1 ? grant : null
}

async function addToIndex(store: KvStore, uid: string, grantId: string): Promise<void> {
  const ids = (await readJson<string[]>(store, KEY.index(uid))) ?? []
  const next = [...ids.filter((id) => id !== grantId), grantId]
  // Past the limit, the oldest connection is revoked rather than kept forever.
  while (next.length > MAX_GRANTS_PER_BROWSER) {
    const oldest = next.shift() as string
    await store.del(KEY.grant(oldest))
  }
  await writeJson(store, KEY.index(uid), next, TTL.grantSeconds * 3)
}

/** Deletes a grant and its encrypted wallet copy. Tokens of a deleted grant stop working at once. */
export async function revokeGrant(store: KvStore, grantId: string, uid?: string): Promise<boolean> {
  const grant = await getGrant(store, grantId)
  if (!grant || (uid !== undefined && grant.uid !== uid)) return false
  await store.del(KEY.grant(grantId))
  const ids = (await readJson<string[]>(store, KEY.index(grant.uid))) ?? []
  await writeJson(store, KEY.index(grant.uid), ids.filter((id) => id !== grantId), TTL.grantSeconds * 3)
  return true
}

export type GrantSummary = { id: string; clientName: string; redirectHost: string; scopes: McpScope[]; capMicro: number; createdAt: string; lastRefreshAt: string }

export async function listGrants(store: KvStore, uid: string): Promise<GrantSummary[]> {
  const ids = (await readJson<string[]>(store, KEY.index(uid))) ?? []
  const grants: GrantSummary[] = []
  for (const id of ids) {
    const grant = await getGrant(store, id)
    if (!grant || !grant.active || grant.uid !== uid) continue
    grants.push({ id: grant.id, clientName: grant.clientName, redirectHost: grant.redirectHost, scopes: grant.scopes, capMicro: grant.capMicro, createdAt: grant.createdAt, lastRefreshAt: grant.refreshedAt })
  }
  return grants
}

// ---------------------------------------------------------------- tokens

export type TokenResponse = { ok: true; body: { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string } }

async function issueTokens(store: KvStore, grant: Grant, dataKey: Buffer, scopes: McpScope[], resource: string, now: Date): Promise<TokenResponse> {
  const access = newToken("access")
  const refresh = newToken("refresh")
  const base = { grantId: grant.id, clientId: grant.clientId, scopes, resource }
  const accessRecord: TokenRecord = { ...base, exp: nowSeconds(now) + TTL.accessSeconds, wrapped: wrapDataKey(dataKey, access, grant.id, "access") }
  const refreshRecord: TokenRecord = { ...base, exp: nowSeconds(now) + TTL.refreshSeconds, wrapped: wrapDataKey(dataKey, refresh, grant.id, "refresh") }
  await writeJson(store, KEY.access(tokenHash(access)), accessRecord, TTL.accessSeconds)
  await writeJson(store, KEY.refresh(tokenHash(refresh)), refreshRecord, TTL.refreshSeconds)
  return { ok: true, body: { access_token: access, token_type: "Bearer", expires_in: TTL.accessSeconds, refresh_token: refresh, scope: scopes.join(" ") } }
}

export async function exchangeCode(
  store: KvStore,
  input: { code: unknown; codeVerifier: unknown; redirectUri: unknown; clientId: unknown; resource?: unknown },
  origin: string,
  now: Date = new Date(),
): Promise<TokenResponse | OAuthError> {
  if (!isTokenOf("code", input.code)) return oauthError("invalid_grant", "The authorization code is not valid.")
  const hash = tokenHash(input.code)
  // Single use, even under concurrency: the first redemption claims the code.
  const fresh = await store.set(KEY.codeUsed(hash), "1", TTL.codeSeconds * 5, { onlyIfAbsent: true })
  const record = await readJson<CodeRecord>(store, KEY.code(hash))
  if (!fresh) {
    // A code used twice may have been stolen: the grant it created is revoked (OAuth 2.1, 4.1.3).
    if (record) await revokeGrant(store, record.grantId)
    return oauthError("invalid_grant", "This authorization code was already used.")
  }
  // The record stays until it expires so that a second redemption can find and revoke its grant.
  if (!record || record.exp < nowSeconds(now)) return oauthError("invalid_grant", "The authorization code expired. Connect again.")
  if (record.clientId !== input.clientId) return oauthError("invalid_grant", "The code was issued to another client.")
  if (input.redirectUri !== undefined && input.redirectUri !== record.redirectUri) return oauthError("invalid_grant", "redirect_uri does not match the authorization request.")
  if (!verifyPkce(input.codeVerifier, record.challenge)) return oauthError("invalid_grant", "PKCE verification failed.")
  if (typeof input.resource === "string" && !sameResource(input.resource, resourceUrl(origin))) return oauthError("invalid_target", "This server only issues tokens for its own MCP endpoint.")
  const grant = await getGrant(store, record.grantId)
  if (!grant) return oauthError("invalid_grant", "The approval expired. Connect again.")
  const dataKey = unwrapDataKey(record.wrapped, input.code, grant.id, "code")
  if (!dataKey) return oauthError("invalid_grant", "The approval could not be opened. Connect again.")

  const active: Grant = { ...grant, active: true, refreshedAt: now.toISOString() }
  await writeJson(store, KEY.grant(grant.id), active, TTL.grantSeconds)
  await addToIndex(store, grant.uid, grant.id)
  try {
    return await issueTokens(store, active, dataKey, record.scopes, record.resource, now)
  } finally {
    dataKey.fill(0)
  }
}

export async function refreshTokens(
  store: KvStore,
  input: { refreshToken: unknown; clientId: unknown; scope?: unknown },
  now: Date = new Date(),
): Promise<TokenResponse | OAuthError> {
  if (!isTokenOf("refresh", input.refreshToken)) return oauthError("invalid_grant", "The refresh token is not valid.")
  const token = input.refreshToken
  const hash = tokenHash(token)
  const reused = await store.get(KEY.refreshUsed(hash))
  if (reused) {
    // Refresh tokens rotate: one presented twice means two parties hold it. Revoke the grant.
    await revokeGrant(store, reused)
    return oauthError("invalid_grant", "This refresh token was already used; the connection was revoked for safety. Connect again.")
  }
  const record = await readJson<TokenRecord>(store, KEY.refresh(hash))
  if (!record || record.exp < nowSeconds(now)) return oauthError("invalid_grant", "The refresh token expired or was revoked. Connect again.")
  if (record.clientId !== input.clientId) return oauthError("invalid_grant", "The refresh token was issued to another client.")
  const claimed = await store.set(KEY.refreshUsed(hash), record.grantId, TTL.refreshSeconds, { onlyIfAbsent: true })
  if (!claimed) {
    await revokeGrant(store, record.grantId)
    return oauthError("invalid_grant", "This refresh token was already used; the connection was revoked for safety. Connect again.")
  }
  await store.del(KEY.refresh(hash))
  const grant = await getGrant(store, record.grantId)
  if (!grant || !grant.active) return oauthError("invalid_grant", "This connection was revoked. Connect again.")
  let scopes = record.scopes
  if (typeof input.scope === "string" && input.scope.trim()) {
    const asked = parseScopes(input.scope)
    if (!asked || asked.some((scope) => !record.scopes.includes(scope))) return oauthError("invalid_scope", "A refresh cannot add scopes.")
    scopes = asked
  }
  const dataKey = unwrapDataKey(record.wrapped, token, grant.id, "refresh")
  if (!dataKey) return oauthError("invalid_grant", "The connection could not be opened. Connect again.")
  const touched: Grant = { ...grant, refreshedAt: now.toISOString() }
  await writeJson(store, KEY.grant(grant.id), touched, TTL.grantSeconds)
  try {
    return await issueTokens(store, touched, dataKey, scopes, record.resource, now)
  } finally {
    dataKey.fill(0)
  }
}

/** RFC 7009: revoking a refresh token ends the whole grant; an access token only itself. */
export async function revokeToken(store: KvStore, token: unknown): Promise<void> {
  if (isTokenOf("refresh", token)) {
    const record = await readJson<TokenRecord>(store, KEY.refresh(tokenHash(token)))
    await store.del(KEY.refresh(tokenHash(token)))
    if (record) await revokeGrant(store, record.grantId)
    return
  }
  if (isTokenOf("access", token)) await store.del(KEY.access(tokenHash(token)))
}

export type AuthenticatedGrant = { grant: Grant; scopes: McpScope[]; dataKey: Buffer }

export type AuthResult = { ok: true; value: AuthenticatedGrant } | { ok: false; error: "invalid_token"; description: string }

/** Checks a bearer token for the MCP endpoint and opens the grant's data key with it. */
export async function authenticateAccessToken(store: KvStore, token: string | null, origin: string, now: Date = new Date()): Promise<AuthResult> {
  const invalid = (description: string): AuthResult => ({ ok: false, error: "invalid_token", description })
  if (!token || !isTokenOf("access", token)) return invalid("Missing or malformed access token.")
  const record = await readJson<TokenRecord>(store, KEY.access(tokenHash(token)))
  if (!record || record.exp < nowSeconds(now)) return invalid("The access token expired or was revoked.")
  if (!sameResource(record.resource, resourceUrl(origin))) return invalid("The access token was issued for another resource.")
  const grant = await getGrant(store, record.grantId)
  if (!grant || !grant.active) return invalid("This connection was revoked in the browser.")
  const dataKey = unwrapDataKey(record.wrapped, token, grant.id, "access")
  if (!dataKey) return invalid("The access token could not be opened.")
  return { ok: true, value: { grant, scopes: record.scopes, dataKey } }
}

/** The wallet seed of an authenticated grant. */
export function openGrantSeed(value: AuthenticatedGrant): Uint8Array | null {
  return openSeed(value.dataKey, value.grant.wallet, value.grant.id, value.grant.address)
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? ""
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match ? match[1] : null
}

