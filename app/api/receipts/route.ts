import { NextResponse } from "next/server"
import { isArcEnabled } from "@/lib/rails"
import { parseFilters, queryReceipts } from "@/lib/receipts/query"
import { getReceiptsSnapshot } from "@/lib/receipts/snapshot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

// Public receipts: every x402 payment, agent-to-agent hire and 8004 registration or review this
// app caused on Solana devnet, plus older treasury activity read back from the chain. While Arc
// is enabled (NEXT_PUBLIC_ENABLE_ARC) Arc testnet receipts are listed too, each with its network.
// GET /api/receipts?type=payment|hire|registration|review&agent=<id or name>&page=1&pageSize=25[&network=solana|arc]
export async function GET(request: Request) {
  const arc = isArcEnabled()
  const filters = parseFilters(new URL(request.url).searchParams, { networks: arc })
  const snapshot = await getReceiptsSnapshot()
  const result = queryReceipts(snapshot.records, filters)
  const network = filters.network ?? (arc ? "all" : "solana:devnet")
  return NextResponse.json(
    { ok: true, network, filters, ...result, sources: snapshot.sources, updatedAt: new Date(snapshot.updatedAt).toISOString() },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=30" } },
  )
}
