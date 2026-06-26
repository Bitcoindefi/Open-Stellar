import { NextResponse } from 'next/server'
import { listX402ExplorerReceipts, type SettlementChain } from '@/lib/protocols/x402'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const rawChain = searchParams.get('chain') || 'all'
  const chain: SettlementChain | 'all' = rawChain === 'stellar' || rawChain === 'bnb' ? rawChain : 'all'

  const data = listX402ExplorerReceipts({
    agent: searchParams.get('agent') || undefined,
    q: searchParams.get('q') || undefined,
    service: searchParams.get('service') || undefined,
    chain,
    page: Number(searchParams.get('page') || 1),
    pageSize: Number(searchParams.get('pageSize') || 50),
  })

  return NextResponse.json({ ok: true, ...data })
}
