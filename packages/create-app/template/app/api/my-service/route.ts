import { NextResponse } from 'next/server'
import { peekX402Quote } from '@/lib/protocols/x402'
import { myFirstAgent } from '@/lib/agents/my-first-agent'

export async function GET(req: Request) {
  const paymentRef = req.headers.get('x-payment-ref')

  if (!paymentRef) {
    return NextResponse.json(
      {
        code: 402,
        serviceId: myFirstAgent.serviceId,
        message: 'x402 payment required. Request a quote from /api/protocol/x402/quote first.',
      },
      { status: 402 },
    )
  }

  const quote = peekX402Quote(paymentRef)
  if (!quote) {
    return NextResponse.json({ ok: false, error: 'Quote not found or expired' }, { status: 402 })
  }

  return NextResponse.json({
    ok: true,
    agent: myFirstAgent.id,
    service: myFirstAgent.serviceId,
    message: 'x402 gate passed - service response',
    paymentRef,
  })
}
