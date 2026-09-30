import { createHash, randomBytes } from "node:crypto"
import { readCookie, seal, unseal } from "@/lib/connections/sealed-cookie"

// OpenRouter OAuth (PKCE): the user signs in to OpenRouter and authorizes Agentic City,
// which receives a key the user controls and can revoke. Nobody pastes an API key.
// https://openrouter.ai/docs/guides/overview/auth/oauth

export const OPENROUTER_COOKIE = "ac_openrouter"
export const OPENROUTER_PKCE_COOKIE = "ac_openrouter_pkce"
export const OPENROUTER_COOKIE_MAX_AGE = 180 * 24 * 60 * 60
export const OPENROUTER_PKCE_MAX_AGE = 10 * 60

const AUTH_URL = "https://openrouter.ai/auth"
const EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys"

export type OpenRouterConnection = { key: string; connectedAt: string }
type PkceState = { verifier: string; state: string; returnTo: string }

export function createPkce() {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  const state = randomBytes(16).toString("base64url")
  return { verifier, challenge, state }
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/"
  return value.slice(0, 300)
}

export function buildAuthorizeUrl(origin: string, challenge: string, state: string): string {
  const callback = new URL("/api/connections/openrouter/callback", origin)
  callback.searchParams.set("state", state)
  const url = new URL(AUTH_URL)
  url.searchParams.set("callback_url", callback.toString())
  url.searchParams.set("code_challenge", challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("key_label", "Agentic City")
  return url.toString()
}

export function sealPkce(value: PkceState): string {
  return seal(value)
}

export function readPkce(req: Request): PkceState | null {
  return unseal<PkceState>(readCookie(req, OPENROUTER_PKCE_COOKIE))
}

export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const response = await fetch(EXCHANGE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`OpenRouter rejected the authorization (HTTP ${response.status}).`)
  const data = await response.json().catch(() => ({})) as { key?: unknown }
  if (typeof data.key !== "string" || data.key.length < 8) throw new Error("OpenRouter did not return a key.")
  return data.key
}

export function readOpenRouterConnection(req: Request): OpenRouterConnection | null {
  const value = unseal<OpenRouterConnection>(readCookie(req, OPENROUTER_COOKIE))
  return value && typeof value.key === "string" && value.key.length >= 8 ? value : null
}

export function cookieOptions(req: Request, maxAge: number) {
  return {
    httpOnly: true,
    secure: new URL(req.url).protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  }
}
