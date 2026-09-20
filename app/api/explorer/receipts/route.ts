import { NextResponse } from 'next/server'
import { listX402ExplorerReceipts, type SettlementChain } from '@/lib/protocols/x402'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const rawChain = (searchParams.get('chain') || 'all').toLowerCase()
  const chain: SettlementChain | 'all' =
    rawChain === 'stellar' || rawChain === 'bnb' || rawChain === 'base' ? rawChain : 'all'

  const q = searchParams.get('q') || undefined
  const agent = searchParams.get('agent') || undefined
  const service = searchParams.get('service') || undefined
  const startDate = searchParams.get('startDate') || searchParams.get('from') || undefined
  const endDate = searchParams.get('endDate') || searchParams.get('to') || undefined

  const rawPage = Number.parseInt(searchParams.get('page') || '1', 10)
  const rawPageSize = Number.parseInt(searchParams.get('pageSize') || '50', 10)

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(100, rawPageSize) : 50

  const data = listX402ExplorerReceipts({
    q,
    agent,
    service,
    chain,
    startDate,
    endDate,
    page,
    pageSize,
  })

  return NextResponse.json({ ok: true, ...data })
}

