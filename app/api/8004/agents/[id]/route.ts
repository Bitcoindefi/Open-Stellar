import { NextResponse } from "next/server"
import { IdentityError, getIdentityStatus } from "@/lib/solana/agent-identity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  try {
    return NextResponse.json({ ok: true, ...(await getIdentityStatus(decodeURIComponent(id))) }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const status = error instanceof IdentityError ? error.status : 502
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not read the registry." }, { status, headers: { "Cache-Control": "no-store" } })
  }
}
