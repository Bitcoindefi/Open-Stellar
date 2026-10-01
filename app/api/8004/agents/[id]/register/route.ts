import { NextResponse } from "next/server"
import { isSameOrigin } from "@/lib/connections/hydrate"
import { readOpenRouterConnection } from "@/lib/connections/openrouter"
import { IdentityError, registerAgentIdentity } from "@/lib/solana/agent-identity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type RouteContext = { params: Promise<{ id: string }> }

const MAX_REGISTRATIONS_PER_INSTANCE = 50
let registrations = 0

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

// Registers the agent's identity, paid by the treasury. Limited to signed-in browsers of this
// site (a connected OpenRouter account) so nobody can drain the treasury from outside.
export async function POST(req: Request, context: RouteContext) {
  if (!isSameOrigin(req)) return json({ ok: false, error: "Cross-site requests are not allowed." }, 403)
  if (!readOpenRouterConnection(req)) return json({ ok: false, error: "Connect OpenRouter before registering agents." }, 401)
  if (registrations >= MAX_REGISTRATIONS_PER_INSTANCE) return json({ ok: false, error: "Too many registrations right now. Try again later." }, 429)

  const { id } = await context.params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 40) : decodeURIComponent(id)
  const model = typeof body.model === "string" ? body.model.trim().slice(0, 60) : ""
  const role = typeof body.role === "string" ? body.role.trim().slice(0, 180) : ""

  try {
    registrations += 1
    const result = await registerAgentIdentity({ id: decodeURIComponent(id), name, role, model }, new URL(req.url).origin)
    if (result.alreadyRegistered) registrations -= 1
    return json({ ok: true, ...result })
  } catch (error) {
    registrations -= 1
    const status = error instanceof IdentityError ? error.status : 502
    const message = error instanceof Error ? error.message : "Registration failed."
    return json({ ok: false, error: /insufficient|0x1\b|lamports/i.test(message) ? "The treasury has no devnet SOL to pay for registration." : message }, status)
  }
}
