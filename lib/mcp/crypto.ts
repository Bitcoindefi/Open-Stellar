import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto"

// Cryptography for the MCP grants: opaque tokens (stored only as hashes), PKCE S256, and the
// envelope that keeps a copy of the agents' wallet key usable only while a token is alive.
//
// The wallet seed of a grant is encrypted (AES-256-GCM) under a random data key. That data key
// is never stored in clear: it is wrapped under a key derived (HKDF-SHA256) from the server
// secret AND the raw bearer token, with the grant id and the token kind as domain separation.
// Redis only holds token hashes, so a copy of Redis plus the server secret still cannot open a
// wallet without a live token; revoking a grant deletes the ciphertext itself.

export type TokenKind = "code" | "access" | "refresh"

const TOKEN_PREFIX: Record<TokenKind | "client", string> = {
  code: "acmc_",
  access: "acma_",
  refresh: "acmr_",
  client: "mcpc_",
}

export function newToken(kind: TokenKind | "client", random: (size: number) => Buffer = randomBytes): string {
  return `${TOKEN_PREFIX[kind]}${random(32).toString("base64url")}`
}

export function newId(random: (size: number) => Buffer = randomBytes): string {
  return random(16).toString("hex")
}

/** The storage key of a token: its SHA-256. The token itself is never stored. */
export function tokenHash(token: string): string {
  return createHash("sha256").update(`agentic-city:mcp-token:v1:${token}`).digest("hex")
}

export function isTokenOf(kind: TokenKind, value: unknown): value is string {
  return typeof value === "string" && value.startsWith(TOKEN_PREFIX[kind]) && /^[A-Za-z0-9_-]{40,80}$/.test(value)
}

const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/

export function isCodeChallenge(value: unknown): value is string {
  return typeof value === "string" && CHALLENGE.test(value)
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) must equal the challenge. Constant time. */
export function verifyPkce(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !VERIFIER.test(verifier)) return false
  const computed = Buffer.from(createHash("sha256").update(verifier).digest("base64url"))
  const expected = Buffer.from(challenge)
  return computed.length === expected.length && timingSafeEqual(computed, expected)
}

/** The server secrets, current first. The same pair the sealed cookies use. */
export function serverSecrets(env: Record<string, string | undefined> = process.env): string[] {
  const current = env.CONNECTIONS_SECRET?.trim() || env.BETTER_AUTH_SECRET?.trim() || ""
  const previous = env.CONNECTIONS_SECRET_PREVIOUS?.trim() || ""
  return [current, previous].filter((value, index, all) => value && all.indexOf(value) === index)
}

export type Sealed = { iv: string; tag: string; ct: string }

function encrypt(key: Buffer, plain: Buffer, aad: string): Sealed {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(Buffer.from(aad, "utf8"))
  const ct = Buffer.concat([cipher.update(plain), cipher.final()])
  return { iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ct: ct.toString("base64url") }
}

function decrypt(key: Buffer, sealed: Sealed, aad: string): Buffer | null {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64url"))
    decipher.setAAD(Buffer.from(aad, "utf8"))
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(sealed.ct, "base64url")), decipher.final()])
  } catch {
    return null
  }
}

/** Key-encryption key for one token of one grant: needs both the server secret and the token. */
function tokenKek(secret: string, token: string, grantId: string, kind: TokenKind): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(token, "utf8"), Buffer.from(`agentic-city:mcp-kek-salt:v1:${secret}`, "utf8"), `agentic-city:mcp-grant-wallet:v1:${kind}:${grantId}`, 32))
}

export function newDataKey(): Buffer {
  return randomBytes(32)
}

/** Wraps the grant's data key under one token. */
export function wrapDataKey(dataKey: Buffer, token: string, grantId: string, kind: TokenKind, env: Record<string, string | undefined> = process.env): Sealed {
  const [secret] = serverSecrets(env)
  if (!secret) throw new Error("Set BETTER_AUTH_SECRET (or CONNECTIONS_SECRET) to connect MCP clients.")
  return encrypt(tokenKek(secret, token, grantId, kind), dataKey, `dek:${grantId}:${kind}`)
}

/** Unwraps the data key with the token that was presented. Null when it does not open. */
export function unwrapDataKey(wrapped: Sealed, token: string, grantId: string, kind: TokenKind, env: Record<string, string | undefined> = process.env): Buffer | null {
  for (const secret of serverSecrets(env)) {
    const key = decrypt(tokenKek(secret, token, grantId, kind), wrapped, `dek:${grantId}:${kind}`)
    if (key && key.length === 32) return key
  }
  return null
}

/** The wallet seed, encrypted under the grant's data key and bound to the grant and address. */
export function sealSeed(dataKey: Buffer, seed: Uint8Array, grantId: string, address: string): Sealed {
  return encrypt(dataKey, Buffer.from(seed), `seed:${grantId}:${address}`)
}

export function openSeed(dataKey: Buffer, sealed: Sealed, grantId: string, address: string): Uint8Array | null {
  const plain = decrypt(dataKey, sealed, `seed:${grantId}:${address}`)
  return plain && plain.length === 32 ? new Uint8Array(plain) : null
}

// Server-to-server proof that a paid task request comes from this server's MCP hire and may run
// on the hosted model. Bound to the agent, the task, the owner and a timestamp.

export const HOSTED_HEADER = "x-agentic-city-hosted"
const HOSTED_MAX_AGE_SECONDS = 300

function hostedMac(secret: string, parts: { agentId: string; task: string; ownerTag: string; ts: number }): string {
  const taskHash = createHash("sha256").update(parts.task).digest("hex")
  return createHmac("sha256", `agentic-city:mcp-hosted:v1:${secret}`).update(`${parts.agentId}\n${taskHash}\n${parts.ownerTag}\n${parts.ts}`).digest("base64url")
}

export function signHostedTask(parts: { agentId: string; task: string; ownerTag: string | null }, now: number = Date.now(), env: Record<string, string | undefined> = process.env): string {
  const [secret] = serverSecrets(env)
  if (!secret) throw new Error("Set BETTER_AUTH_SECRET (or CONNECTIONS_SECRET) to hire from MCP.")
  const ts = Math.floor(now / 1000)
  const ownerTag = parts.ownerTag ?? "-"
  return `v1.${ts}.${ownerTag}.${hostedMac(secret, { agentId: parts.agentId, task: parts.task, ownerTag, ts })}`
}

/** Checks the header; returns the owner tag it vouches for ("" when none) or null when invalid. */
export function verifyHostedTask(header: string | null, parts: { agentId: string; task: string }, now: number = Date.now(), env: Record<string, string | undefined> = process.env): { ownerTag: string | null } | null {
  if (!header) return null
  const match = /^v1\.(\d{1,12})\.([0-9a-f]{20}|-)\.([A-Za-z0-9_-]{43})$/.exec(header)
  if (!match) return null
  const ts = Number(match[1])
  if (Math.abs(Math.floor(now / 1000) - ts) > HOSTED_MAX_AGE_SECONDS) return null
  const given = Buffer.from(match[3])
  for (const secret of serverSecrets(env)) {
    const expected = Buffer.from(hostedMac(secret, { agentId: parts.agentId, task: parts.task, ownerTag: match[2], ts }))
    if (expected.length === given.length && timingSafeEqual(expected, given)) return { ownerTag: match[2] === "-" ? null : match[2] }
  }
  return null
}
