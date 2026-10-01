import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

// Small authenticated-encryption helper for connection credentials kept in httpOnly cookies.
// The browser only ever holds ciphertext; the key never leaves the server.

function secret(): string | null {
  return process.env.CONNECTIONS_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim() || null
}

export function isSealingConfigured(): boolean {
  return Boolean(secret())
}

function key(): Buffer {
  const value = secret()
  if (!value) throw new Error("Set BETTER_AUTH_SECRET (or CONNECTIONS_SECRET) to store connections.")
  return createHash("sha256").update(`agentic-city:connections:v1:${value}`).digest()
}

export function seal(payload: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")
}

export function unseal<T>(token: string | null | undefined): T | null {
  if (!token) return null
  try {
    const raw = Buffer.from(token, "base64url")
    if (raw.length < 29) return null
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
    return JSON.parse(plain) as T
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
