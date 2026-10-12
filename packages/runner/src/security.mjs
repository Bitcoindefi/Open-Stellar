// Who may talk to the runner: a page from an allowed origin that holds the pairing token,
// reaching it on the loopback interface. The token is the real gate; origin and host checks are
// defense in depth (CORS for browsers, Host against DNS rebinding).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export const DEFAULT_APP_URL = "https://agentic-city.vercel.app"

export const DEFAULT_ORIGINS = [
  "https://agentic-city.vercel.app",
  "https://agentcity-app.vercel.app",
  "https://agentarena-app.vercel.app",
  "https://openstellar.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]

// Vercel deployment URLs of the project (open-stellar-<9 chars>-leocagli.vercel.app).
const PREVIEW_ORIGIN = /^https:\/\/open-stellar-[a-z0-9]{9}-leocagli\.vercel\.app$/

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,128}$/

export function generateToken() {
  return randomBytes(32).toString("base64url")
}

export function isValidToken(token) {
  return typeof token === "string" && TOKEN_PATTERN.test(token)
}

/** Normalizes an origin string ("https://x.app/" -> "https://x.app"), or null when invalid. */
export function normalizeOrigin(value) {
  try {
    const url = new URL(String(value))
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return url.origin
  } catch {
    return null
  }
}

export function isAllowedOrigin(origin, extraOrigins = []) {
  if (typeof origin !== "string" || !origin) return false
  if (DEFAULT_ORIGINS.includes(origin)) return true
  if (PREVIEW_ORIGIN.test(origin)) return true
  return extraOrigins.includes(origin)
}

/** Only loopback names on our own port, so a rebinding DNS name cannot reach the runner. */
export function isAllowedHost(hostHeader, port) {
  if (typeof hostHeader !== "string") return false
  const host = hostHeader.trim().toLowerCase()
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host)
}

export function readBearer(header) {
  if (typeof header !== "string") return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match ? match[1] : null
}

/** Constant-time comparison (hashing first keeps the lengths equal). */
export function tokensMatch(expected, provided) {
  if (typeof expected !== "string" || typeof provided !== "string" || !expected || !provided) return false
  const a = createHash("sha256").update(expected).digest()
  const b = createHash("sha256").update(provided).digest()
  return timingSafeEqual(a, b)
}

/** The link the person opens once to hand the token to the web app (kept in the URL hash). */
export function pairingLink(appUrl, token, port, defaultPort) {
  const base = String(appUrl).replace(/\/+$/, "")
  const fragment = port === defaultPort ? token : `token=${token}&port=${port}`
  return `${base}/runner#${fragment}`
}
