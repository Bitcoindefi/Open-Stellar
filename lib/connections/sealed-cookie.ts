import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

// Small authenticated-encryption helper for state kept in httpOnly cookies (connection
// credentials, the anonymous browser id, the per-browser agent wallet). The browser only ever
// holds ciphertext; the key never leaves the server.
//
// Each kind of cookie uses its own key ("purpose"), derived from the same server secret, so a
// value sealed for one purpose can never be replayed as another. Rotation: set the new secret
// in CONNECTIONS_SECRET and the old one in CONNECTIONS_SECRET_PREVIOUS; cookies sealed with the
// old secret still open (reported as `stale`) and are re-sealed with the new one when written.

export type SealPurpose = "connections" | "browser-id" | "agent-wallet"

function currentSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.CONNECTIONS_SECRET?.trim() || env.BETTER_AUTH_SECRET?.trim() || null
}

function previousSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.CONNECTIONS_SECRET_PREVIOUS?.trim() || null
}

export function isSealingConfigured(): boolean {
  return Boolean(currentSecret())
}

function keyFor(purpose: SealPurpose, value: string): Buffer {
  return createHash("sha256").update(`agentic-city:${purpose}:v1:${value}`).digest()
}

function currentKey(purpose: SealPurpose): Buffer {
  const value = currentSecret()
  if (!value) throw new Error("Set BETTER_AUTH_SECRET (or CONNECTIONS_SECRET) to store connections.")
  return keyFor(purpose, value)
}

export function sealFor(purpose: SealPurpose, payload: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", currentKey(purpose), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")
}

function open<T>(raw: Buffer, key: Buffer): T | null {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
    return JSON.parse(plain) as T
  } catch {
    return null
  }
}

/** Opens a sealed value. `stale` is true when it was sealed with the previous secret. */
export function unsealFor<T>(purpose: SealPurpose, token: string | null | undefined): { value: T; stale: boolean } | null {
  if (!token) return null
  const current = currentSecret()
  if (!current) return null
  const raw = Buffer.from(token, "base64url")
  if (raw.length < 29) return null
  const value = open<T>(raw, keyFor(purpose, current))
  if (value !== null) return { value, stale: false }
  const previous = previousSecret()
  if (!previous || previous === current) return null
  const old = open<T>(raw, keyFor(purpose, previous))
  return old === null ? null : { value: old, stale: true }
}

export function seal(payload: unknown): string {
  return sealFor("connections", payload)
}

export function unseal<T>(token: string | null | undefined): T | null {
  try {
    return unsealFor<T>("connections", token)?.value ?? null
  } catch {
    return null
  }
}

export function readCookie(req: Request, name: string): string | null {
  const prefix = `${name}=`
  const value = (req.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length)
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/** A cookie a route should set on its response. */
export type CookieWrite = { name: string; value: string; maxAge: number }

/** Serializes an httpOnly, SameSite=Lax cookie; Secure on https. Works on any Response. */
export function serializeCookie(req: Request, cookie: CookieWrite): string {
  const parts = [
    `${cookie.name}=${encodeURIComponent(cookie.value)}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(cookie.maxAge))}`,
    "HttpOnly",
    "SameSite=Lax",
  ]
  if (new URL(req.url).protocol === "https:") parts.push("Secure")
  return parts.join("; ")
}

export function appendCookies(req: Request, headers: Headers, cookies: CookieWrite[]): void {
  for (const cookie of cookies) headers.append("Set-Cookie", serializeCookie(req, cookie))
}
