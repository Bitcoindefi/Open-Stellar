import { createHmac } from "node:crypto"
import { getSessionUser, isGoogleConfigured } from "@/lib/auth/user-auth"
import { readBrowserId } from "@/lib/identity/browser-id"

// Who owns an agent identity. Agent ids come from the browser ("worker-1" is the default for
// everyone), so the on-chain asset is namespaced by an owner tag, a keyed hash of:
//  - the Google account, when the person chose to sign in (optional; follows them across devices);
//  - otherwise the anonymous browser id (lib/identity/browser-id.ts). No sign-in is needed.
// The tag is public (it goes in the registration URI) but reveals nothing about the account.

export type AgentOwner = { kind: "google" | "browser"; tag: string }

const OWNER_TAG = /^[0-9a-f]{20}$/

export function isOwnerTag(value: unknown): value is string {
  return typeof value === "string" && OWNER_TAG.test(value)
}

export function ownerTagFor(identity: string): string | null {
  const key = process.env.SOLANA_SERVER_SECRET?.trim()
  if (!key || !identity) return null
  return createHmac("sha256", key).update(`agentic-city:agent-owner:v1:${identity}`).digest("hex").slice(0, 20)
}

export function browserOwner(browserId: string): AgentOwner | null {
  const tag = ownerTagFor(`browser:${browserId}`)
  return tag ? { kind: "browser", tag } : null
}

async function googleOwner(req: Request): Promise<AgentOwner | null> {
  if (!isGoogleConfigured()) return null
  try {
    const user = await getSessionUser(req.headers)
    const email = user?.email?.trim().toLowerCase()
    const tag = email ? ownerTagFor(`google:${email}`) : null
    return tag ? { kind: "google", tag } : null
  } catch {
    return null
  }
}

/** The owner of this request: the Google account when signed in, else the browser id. Read-only. */
export async function resolveAgentOwner(req: Request): Promise<AgentOwner | null> {
  const google = await googleOwner(req)
  if (google) return google
  const browser = readBrowserId(req)
  return browser ? browserOwner(browser.id) : null
}

/** Key that names one agent of one owner (or a legacy, un-namespaced agent). */
export function scopedAgentKey(agentId: string, ownerTag: string | null | undefined): string {
  return `${isOwnerTag(ownerTag) ? ownerTag : "legacy"}/${agentId.trim().slice(0, 80)}`
}
