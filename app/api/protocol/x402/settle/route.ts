import { createApiRouteLogger } from '@/lib/api-logging'
import { authorizePayment } from '@/lib/passport/passport'
import { peekX402Quote, settleX402 } from '@/lib/protocols/x402'
import { isMockMode } from '@/lib/mock/mock-mode'
import { settleMockX402 } from '@/lib/mock/x402-mock'
import { publishSystemEvent } from '@/lib/events/system-events'
import { XP_AWARDS } from '@/lib/gamification/constants'
import { awardXP } from '@/lib/gamification/xp'

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/x402/settle')

  try {
    const body = await req.json()
    const paymentRef = String(body.paymentRef || '')
    const chain = body.chain === 'stellar' ? 'stellar' : 'bnb'
    const agentId = body.agentId ? String(body.agentId) : ''
    const paidBy = String(body.paidBy || 'unknown')

    if (isMockMode()) {
      const receipt = settleMockX402({
        paymentRef,
        chain,
        txHash: body.txHash ? String(body.txHash) : undefined,
      })
      if (agentId || paidBy) {
        awardXP(agentId || paidBy, XP_AWARDS.X402_PAYMENT_RECEIVED, 'payment.received')
        publishSystemEvent({
          type: 'payment.received',
          agentId: agentId || paidBy,
          receipt,
        })
      }
      return await api.json({ ok: true, receipt }, undefined, { event: 'x402.settle.mock', paymentRef })
    }

    // Agent Passport gate: if the payment is made on behalf of an agent, it may
    // settle only when the agent holds a valid on-chain passport whose proven
    // (hidden) spend cap covers the quoted amount. See lib/passport/passport.ts.
    if (agentId) {
      const quote = peekX402Quote(paymentRef)
      if (!quote) {
        return await api.json(
          { ok: false, error: 'Quote not found for paymentRef' },
          { status: 400 },
          { event: 'x402.settle.rejected', reason: 'quote_not_found', paymentRef, chain, agentId },
        )
      }
      const gate = await authorizePayment(agentId, quote.amountUnits)
      if (!gate.authorized) {
        return await api.report(
          'warn',
          new Error(gate.reason),
          { ok: false, error: `Passport gate: ${gate.reason}`, gate },
          { status: 402 },
          { event: 'x402.settle.passport_denied', reason: gate.reason, paymentRef, chain, agentId, cap: gate.cap },
        )
      }
    }

    const result = settleX402({
      paymentRef,
      chain,
      txHash: String(body.txHash || ''),
      paidBy,
    })

    if (!result.ok || !result.receipt) {
      return await api.json(
        { ok: false, error: result.error || 'x402 settlement rejected' },
        { status: 400 },
        { event: 'x402.settle.rejected', reason: result.error, paymentRef, chain, paidBy },
      )
    }

    publishSystemEvent({
      type: 'payment.received',
      agentId: agentId || paidBy,
      receipt: result.receipt,
    })
    awardXP(agentId || paidBy, XP_AWARDS.X402_PAYMENT_RECEIVED, 'payment.received')

    return await api.json({ ok: true, receipt: result.receipt }, undefined, {
      event: 'x402.settle.completed',
      paymentRef,
      chain,
      paidBy,
      txHash: result.receipt.txHash,
    })
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed settling x402 payment' },
      { status: 500 },
      { event: 'x402.settle.failed' },
    )
  }
}
