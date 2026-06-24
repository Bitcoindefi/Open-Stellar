import { NextResponse } from 'next/server'
import { createX402Quote } from '@/lib/protocols/x402'
import { isMockMode } from '@/lib/mock/mock-mode'
import { createMockX402Quote } from '@/lib/mock/x402-mock'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const quoteInput = {
      serviceId: String(body.serviceId || 'ai-agent-service'),
      chain: body.chain === 'stellar' ? 'stellar' as const : 'bnb' as const,
      payer: String(body.payer || 'anonymous'),
      units: Number(body.units || 1),
      unitPriceUsd: Number(body.unitPriceUsd || 0.1),
      ttlSeconds: Number(body.ttlSeconds || 300),
    }

    const quote = isMockMode() ? createMockX402Quote(quoteInput) : createX402Quote(quoteInput)

    return NextResponse.json({ ok: true, quote })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed generating x402 quote' },
      { status: 500 }
    )
  }
}

