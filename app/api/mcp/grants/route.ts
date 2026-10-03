import { NextResponse } from "next/server"
import { isSameOrigin, isStrictSameOrigin } from "@/lib/connections/hydrate"
import { readBrowserId } from "@/lib/identity/browser-id"
import { listGrants, revokeGrant } from "@/lib/mcp/oauth"
import { microToUsdc } from "@/lib/orchestration/budget"
import { getKvStore } from "@/lib/security/kv-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

// "Clientes MCP conectados": the MCP clients this browser approved, and revoking one.
export async function GET(req: Request) {
  if (!isSameOrigin(req)) return json({ ok: false, error: "Cross-site requests are not allowed." }, 403)
  const browser = readBrowserId(req)
  if (!browser) return json({ ok: true, clients: [] })
  try {
    const grants = await listGrants(getKvStore(), browser.id)
    return json({
      ok: true,
      clients: grants.map((grant) => ({ ...grant, capUsdc: microToUsdc(grant.capMicro) })),
    })
  } catch {
    return json({ ok: false, error: "No pudimos leer los clientes conectados ahora." }, 503)
  }
}

export async function DELETE(req: Request) {
  if (!isStrictSameOrigin(req)) return json({ ok: false, error: "Cross-site requests are not allowed." }, 403)
  const browser = readBrowserId(req)
  if (!browser) return json({ ok: false, error: "Este navegador no tiene clientes conectados." }, 404)
  const body = await req.json().catch(() => null) as { id?: unknown } | null
  const id = typeof body?.id === "string" ? body.id : ""
  try {
    const removed = await revokeGrant(getKvStore(), id, browser.id)
    return removed ? json({ ok: true }) : json({ ok: false, error: "Ese cliente ya no está conectado." }, 404)
  } catch {
    return json({ ok: false, error: "No pudimos desconectarlo ahora. Probá de nuevo." }, 503)
  }
}
