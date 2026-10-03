import type { MoltbotAgent } from "@/lib/types"

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * What the home page gets when it asks for the admin's cloud agents.
 * - `agents`: the admin session is valid; these are the agents (possibly none).
 * - `not-admin`: no admin session in this browser; the caller should stop asking.
 * - `unavailable`: a network or server error; the caller may try again later.
 */
export type CloudAgentsResult =
  | { kind: "agents"; agents: MoltbotAgent[] }
  | { kind: "not-admin" }
  | { kind: "unavailable" }

/**
 * Loads the cloud agents only for an admin. The admin session cookie is httpOnly, so the
 * browser asks the public `/api/admin/session` endpoint first (always 200) and only calls
 * `/api/admin/agents` when that says the session is valid. Anonymous visitors never hit the
 * protected route, so they get no 401 in the console.
 */
export async function fetchCloudAgentsForAdmin(fetchImpl: FetchLike = fetch): Promise<CloudAgentsResult> {
  try {
    const sessionRes = await fetchImpl("/api/admin/session", { cache: "no-store" })
    if (!sessionRes.ok) return { kind: "unavailable" }
    const session = await sessionRes.json().catch(() => null) as { authenticated?: unknown } | null
    if (session?.authenticated !== true) return { kind: "not-admin" }

    const res = await fetchImpl("/api/admin/agents", { cache: "no-store" })
    // The session can expire between the two calls.
    if (res.status === 401 || res.status === 403) return { kind: "not-admin" }
    if (!res.ok) return { kind: "unavailable" }
    const data = await res.json().catch(() => null) as { agents?: unknown } | null
    return { kind: "agents", agents: Array.isArray(data?.agents) ? data.agents as MoltbotAgent[] : [] }
  } catch {
    return { kind: "unavailable" }
  }
}
