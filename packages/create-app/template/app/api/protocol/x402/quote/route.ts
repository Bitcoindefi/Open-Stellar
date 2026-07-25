import { NextResponse } from 'next/server'
import { createX402Quote } from '@/lib/protocols/x402'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const quote = createX402Quote({
      serviceId: String(body.serviceId || 'my-service'),
      chain: body.chain === 'stellar' ? 'stellar' : 'bnb',
      payer: String(body.payer || 'anonymous'),
      units: Number(body.units || 1),
      unitPriceUsd: Number(body.unitPriceUsd || 0.1),
      ttlSeconds: Number(body.ttlSeconds || 300),
    })

    return NextResponse.json({ ok: true, quote })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed generating x402 quote' },
      { status: 500 },
    )
  }
}
