import { NextResponse } from "next/server"
import { agentAssetKeypair, buildRegistrationFile, getServerKeypair, normalizeAgentId } from "@/lib/solana/agent-identity"
import { isOwnerTag } from "@/lib/solana/agent-owner"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

// The registration file the on-chain identity points to (8004 agent card). The `o` query
// parameter is the public owner tag the asset was derived with (absent for legacy agents).
export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = normalizeAgentId(decodeURIComponent(id))
  const url = new URL(req.url)
  const ownerTag = url.searchParams.get("o")
  const server = getServerKeypair()
  const asset = server ? agentAssetKeypair(server, agentId, isOwnerTag(ownerTag) ? ownerTag : null).publicKey.toBase58() : null
  return NextResponse.json(buildRegistrationFile(url.origin, agentId, url.searchParams, asset), {
    headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  })
}
