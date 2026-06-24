import { NextResponse } from 'next/server'
import { peekX402Quote, settleX402 } from '@/lib/protocols/x402'
import { authorizePayment } from '@/lib/passport/passport'
import { isMockMode } from '@/lib/mock/mock-mode'
import { settleMockX402 } from '@/lib/mock/x402-mock'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const paymentRef = String(body.paymentRef || '')
    const chain = body.chain === 'stellar' ? 'stellar' : 'bnb'
    const agentId = body.agentId ? String(body.agentId) : ''

    if (isMockMode()) {
      const receipt = settleMockX402({
        paymentRef,
        chain,
        txHash: body.txHash ? String(body.txHash) : undefined,
      })
      return NextResponse.json({ ok: true, receipt })
    }

    // Agent Passport gate: if the payment is made on behalf of an agent, it may
    // settle only when the agent holds a valid on-chain passport whose proven
    // (hidden) spend cap covers the quoted amount. See lib/passport/passport.ts.
    if (agentId) {
      const quote = peekX402Quote(paymentRef)
      if (!quote) {
        return NextResponse.json({ ok: false, error: 'Quote not found for paymentRef' }, { status: 400 })
      }
      const gate = await authorizePayment(agentId, quote.amountUnits)
      if (!gate.authorized) {
        return NextResponse.json(
          { ok: false, error: `Passport gate: ${gate.reason}`, gate },
          { status: 402 },
        )
      }
    }

    const result = settleX402({
      paymentRef,
      chain,
      txHash: String(body.txHash || ''),
      paidBy: String(body.paidBy || 'unknown'),
    })

    if (!result.ok || !result.receipt) {
      return NextResponse.json({ ok: false, error: result.error || 'x402 settlement rejected' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, receipt: result.receipt })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed settling x402 payment' },
      { status: 500 },
    )
  }
}

