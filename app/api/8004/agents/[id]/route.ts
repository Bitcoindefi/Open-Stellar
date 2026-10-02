import { NextResponse } from "next/server"
import { IdentityError, getIdentityStatus, getServerKeypair } from "@/lib/solana/agent-identity"
import { resolveAgentOwner } from "@/lib/solana/agent-owner"
import { getPayTo } from "@/lib/solana/x402"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

// Public keys the browser checks before signing: who must pay review fees (`feePayer`) and
// where x402 payments must go (`payTo`). Both are public addresses, not secrets.
function treasury() {
  return { feePayer: getServerKeypair()?.publicKey.toBase58() ?? null, payTo: getPayTo() }
}

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params
  try {
    const owner = await resolveAgentOwner(req)
    const status = await getIdentityStatus({ id: decodeURIComponent(id), ownerTag: owner?.tag ?? null })
    return NextResponse.json({ ok: true, ...status, treasury: treasury() }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const status = error instanceof IdentityError ? error.status : 502
    return NextResponse.json({ ok: false, error: error instanceof IdentityError ? error.message : "Could not read the registry.", treasury: treasury() }, { status, headers: { "Cache-Control": "no-store" } })
  }
}
