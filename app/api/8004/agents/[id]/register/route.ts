import { NextResponse } from "next/server"
import { isGoogleConfigured } from "@/lib/auth/user-auth"
import { isStrictSameOrigin } from "@/lib/connections/hydrate"
import { IdentityError, registerAgentIdentity } from "@/lib/solana/agent-identity"
import { resolveAgentOwner } from "@/lib/solana/agent-owner"
import { REGISTRATION_LIMITS, reserveRegistration } from "@/lib/solana/registration-quota"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type RouteContext = { params: Promise<{ id: string }> }

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

// Registers the agent's identity, paid by the treasury. Only for signed-in users of this site
// (Google when it is configured, otherwise a connected OpenRouter account), with a daily quota
// per user and a global daily cap kept in the shared store, so nobody can drain the treasury.
export async function POST(req: Request, context: RouteContext) {
  if (!isStrictSameOrigin(req)) return json({ ok: false, error: "Cross-site requests are not allowed." }, 403)
  const owner = await resolveAgentOwner(req)
  if (!owner) {
    return json({ ok: false, error: isGoogleConfigured() ? "Sign in with Google before registering agents." : "Connect OpenRouter before registering agents." }, 401)
  }

  const { id } = await context.params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 40) : decodeURIComponent(id)
  const model = typeof body.model === "string" ? body.model.trim().slice(0, 60) : ""
  const role = typeof body.role === "string" ? body.role.trim().slice(0, 180) : ""

  let reservation: Awaited<ReturnType<typeof reserveRegistration>>
  try {
    reservation = await reserveRegistration(owner.tag)
  } catch (error) {
    console.error("[8004] registration quota unavailable:", error instanceof Error ? error.message : error)
    return json({ ok: false, error: "Registration is unavailable right now. Try again later." }, 503)
  }
  if (!reservation.ok) {
    return json({
      ok: false,
      error: reservation.scope === "owner"
        ? `You can register up to ${REGISTRATION_LIMITS.perOwnerPerDay} agents per day.`
        : "Too many registrations today. Try again tomorrow.",
    }, 429)
  }

  try {
    const result = await registerAgentIdentity({ id: decodeURIComponent(id), name, role, model, ownerTag: owner.tag }, new URL(req.url).origin)
    if (result.alreadyRegistered) await reservation.release()
    return json({ ok: true, ...result })
  } catch (error) {
    await reservation.release().catch(() => undefined)
    const status = error instanceof IdentityError ? error.status : 502
    const message = error instanceof Error ? error.message : ""
    if (/insufficient|0x1\b|lamports/i.test(message)) return json({ ok: false, error: "The treasury has no devnet SOL to pay for registration." }, status)
    if (!(error instanceof IdentityError)) console.error("[8004] registration failed:", message)
    return json({ ok: false, error: error instanceof IdentityError ? message : "Registration failed. Try again later." }, status)
  }
}
