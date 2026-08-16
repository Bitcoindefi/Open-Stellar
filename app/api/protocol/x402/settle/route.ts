import { createApiRouteLogger } from '@/lib/api-logging'
import { authorizePayment } from '@/lib/passport/passport'
import { getX402SubscriptionById, peekX402Quote, settleX402 } from '@/lib/protocols/x402'
import { subscription_anchor, type SubscriptionPaymentProof } from '@/lib/protocols/subscription-anchor'
import { isMockMode } from '@/lib/mock/mock-mode'
import { settleMockX402 } from '@/lib/mock/x402-mock'
import { publishSystemEvent } from '@/lib/events/system-events'
import { XP_AWARDS } from '@/lib/gamification/constants'
import { awardXP } from '@/lib/gamification/xp'

function ledgerFromBody(body: Record<string, unknown>): unknown {
  return body.lastPaymentLedger ?? body.ledger ?? body.ledgerSequence
}

function subscriptionMatchesQuote(
  subscription: ReturnType<typeof getX402SubscriptionById>,
  quote: ReturnType<typeof peekX402Quote>,
) {
  if (!subscription || !quote) return true
  return subscription.agentId === quote.payer && subscription.serviceId === quote.serviceId
}

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/x402/settle')

  try {
    const body = await req.json()
    const paymentRef = String(body.paymentRef || body.quoteId || '')
    const chain = body.chain === 'bnb' || body.chain === 'base' || body.chain === 'stellar' ? body.chain : 'stellar'
    const agentId = body.agentId ? String(body.agentId) : ''
    const paidBy = String(body.paidBy || 'unknown')
    const subscriptionId = body.subscriptionId ? String(body.subscriptionId) : ''
    const subscription = subscriptionId ? getX402SubscriptionById(subscriptionId) : undefined
    const quote = peekX402Quote(paymentRef)

    if (subscriptionId && !subscription) {
      return await api.json(
        { ok: false, error: 'Subscription not found' },
        { status: 400 },
        { event: 'x402.settle.rejected', reason: 'subscription_not_found', paymentRef, chain, paidBy, subscriptionId },
      )
    }

    if (subscriptionId && !subscriptionMatchesQuote(subscription, quote)) {
      return await api.json(
        { ok: false, error: 'subscriptionId does not match quote payer/service' },
        { status: 400 },
        {
          event: 'x402.settle.rejected',
          reason: 'subscription_quote_mismatch',
          paymentRef,
          chain,
          paidBy,
          subscriptionId,
          quotePayer: quote?.payer,
          quoteServiceId: quote?.serviceId,
        },
      )
    }

    if (isMockMode()) {
      const receipt = settleMockX402({
        paymentRef,
        chain,
        txHash: body.txHash ? String(body.txHash) : undefined,
      })
      const subscriptionProof = subscriptionId
        ? subscription_anchor.record_payment({
          subscriptionId,
          txHash: receipt.txHash,
          ledger: ledgerFromBody(body),
        })
        : undefined
      if (agentId || paidBy) {
        awardXP(agentId || paidBy, XP_AWARDS.X402_PAYMENT_RECEIVED, 'payment.received')
        publishSystemEvent({
          type: 'payment.received',
          agentId: agentId || paidBy,
          receipt,
        })
      }
      return await api.json({ ok: true, receipt, subscriptionProof }, undefined, { event: 'x402.settle.mock', paymentRef, subscriptionId })
    }

    // Agent Passport gate: if the payment is made on behalf of an agent, it may
    // settle only when the agent holds a valid on-chain passport whose proven
    // (hidden) spend cap covers the quoted amount. See lib/passport/passport.ts.
    if (agentId) {
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
      agentId,
    })

    if (!result.ok || !result.receipt) {
      return await api.json(
        { ok: false, error: result.error || 'x402 settlement rejected' },
        { status: 400 },
        { event: 'x402.settle.rejected', reason: result.error, paymentRef, chain, paidBy },
      )
    }

    let subscriptionProof: SubscriptionPaymentProof | undefined
    if (subscriptionId) {
      subscriptionProof = subscription_anchor.record_payment({
        subscriptionId,
        txHash: result.receipt.txHash,
        ledger: ledgerFromBody(body),
      })
    }

    publishSystemEvent({
      type: 'payment.received',
      agentId: agentId || paidBy,
      receipt: result.receipt,
    })
    awardXP(agentId || paidBy, XP_AWARDS.X402_PAYMENT_RECEIVED, 'payment.received')

    return await api.json({ ok: true, receipt: result.receipt, subscriptionProof }, undefined, {
      event: 'x402.settle.completed',
      paymentRef,
      chain,
      paidBy,
      txHash: result.receipt.txHash,
      subscriptionId,
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
