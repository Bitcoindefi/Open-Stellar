import { randomBytes } from "node:crypto"
import { isSealingConfigured, readCookie, sealFor, unsealFor, type CookieWrite } from "@/lib/connections/sealed-cookie"

// The anonymous identity of one browser: a random 128-bit id in a sealed httpOnly cookie.
// Nobody signs in to use Agentic City; this id is what owns the browser's agents (8004
// registrations) and what the per-browser spending caps and quotas count against.
// Clearing cookies makes a new, unrelated browser identity; that is the intended trade-off.

export const BROWSER_ID_COOKIE = "ac_uid"
export const BROWSER_ID_MAX_AGE = 365 * 24 * 60 * 60

type SealedBrowserId = { v: 1; id: string; iat: number }

const BROWSER_ID = /^[0-9a-f]{32}$/

export function isBrowserId(value: unknown): value is string {
  return typeof value === "string" && BROWSER_ID.test(value)
}

export function newBrowserId(random: (size: number) => Buffer = randomBytes): string {
  return random(16).toString("hex")
}

export function browserIdCookie(id: string, now: number = Date.now()): CookieWrite {
  const payload: SealedBrowserId = { v: 1, id, iat: Math.floor(now / 1000) }
  return { name: BROWSER_ID_COOKIE, value: sealFor("browser-id", payload), maxAge: BROWSER_ID_MAX_AGE }
}

/** The browser id in the request, or null when there is none (or it does not open). */
export function readBrowserId(req: Request): { id: string; stale: boolean } | null {
  try {
    const opened = unsealFor<SealedBrowserId>("browser-id", readCookie(req, BROWSER_ID_COOKIE))
    if (!opened || opened.value?.v !== 1 || !isBrowserId(opened.value.id)) return null
    return { id: opened.value.id, stale: opened.stale }
  } catch {
    return null
  }
}

/**
 * The browser id, creating one when the request has none. `cookie` is what to set on the
 * response (a new id, or an old one re-sealed after a secret rotation); null when nothing changes.
 * Null overall when this server cannot seal cookies (no BETTER_AUTH_SECRET / CONNECTIONS_SECRET).
 */
export function ensureBrowserId(req: Request): { id: string; cookie: CookieWrite | null; created: boolean } | null {
  if (!isSealingConfigured()) return null
  const existing = readBrowserId(req)
  if (existing) return { id: existing.id, cookie: existing.stale ? browserIdCookie(existing.id) : null, created: false }
  const id = newBrowserId()
  return { id, cookie: browserIdCookie(id), created: true }
}
