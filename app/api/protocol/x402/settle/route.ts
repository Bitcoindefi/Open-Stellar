import { createApiRouteLogger } from '@/lib/api-logging'
import { authorizePayment } from '@/lib/passport/passport'
import { getX402SubscriptionById, peekX402Quote, settleX402 } from '@/lib/protocols/x402'
import { subscription_anchor, type SubscriptionPaymentProof } from '@/lib/protocols/subscription-anchor'
import { isMockMode } from '@/lib/mock/mock-mode'
import { settleMockX402 } from '@/lib/mock/x402-mock'
import { publishSystemEvent } from '@/lib/events/system-events'
import { XP_AWARDS } from '@/lib/gamification/constants'
import { awardXP } from '@/lib/gamification/xp'
import { withApiKeyAuth } from '@/lib/auth/api-key-middleware'
import { withSpan, addSpanEvent } from '@/lib/observability/tracing'
import { incrementCounter, recordHistogram, AgentMetrics, Timer } from '@/lib/observability/metrics'

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

export const POST = withApiKeyAuth(async (req: Request) => {
  const api = createApiRouteLogger(req, '/api/protocol/x402/settle')
  const timer = new Timer(AgentMetrics.X402_SETTLEMENT_DURATION, { chain: 'unknown' }, 'Duration of x402 payment settlement')
  const settlementSpan = createSpan('x402.settlement', { path: '/api/protocol/x402/settle' })

  try {
    const body = await req.json()
    const paymentRef = String(body.paymentRef || body.quoteId || '')
    const chain = body.chain === 'bnb' || body.chain === 'base' || body.chain === 'stellar' ? body.chain : 'stellar'
    const agentId = body.agentId ? String(body.agentId) : ''
    const paidBy = String(body.paidBy || 'unknown')
    const subscriptionId = body.subscriptionId ? String(body.subscriptionId) : ''
    const subscription = subscriptionId ? getX402SubscriptionById(subscriptionId) : undefined
    const quote = peekX402Quote(paymentRef)

    // Update timer labels
    timer.labels = { chain }

    // Update span attributes
    settlementSpan.attributes = {
      paymentRef,
      chain,
      agentId,
      paidBy,
      subscriptionId,
    }

    if (subscriptionId && !subscription) {
      addSpanEvent(settlementSpan, 'subscription_not_found', { subscriptionId })
      finishSpan(settlementSpan, 'error')
      incrementCounter(AgentMetrics.X402_PAYMENTS_FAILED, 1, { reason: 'subscription_not_found', chain })
      timer.stop()
      
      return await api.json(
        { ok: false, error: 'Subscription not found' },
        { status: 400 },
        { event: 'x402.settle.rejected', reason: 'subscription_not_found', paymentRef, chain, paidBy, subscriptionId },
      )
    }

    if (subscriptionId && !subscriptionMatchesQuote(subscription, quote)) {
      addSpanEvent(settlementSpan, 'subscription_mismatch', { subscriptionId, payer: quote?.payer })
      finishSpan(settlementSpan, 'error')
      incrementCounter(AgentMetrics.X402_PAYMENTS_FAILED, 1, { reason: 'subscription_mismatch', chain })
      timer.stop()
      
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
      addSpanEvent(settlementSpan, 'mock_mode', { paymentRef })
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
      finishSpan(settlementSpan, 'ok')
      incrementCounter(AgentMetrics.X402_PAYMENTS_SETTLED, 1, { chain, mode: 'mock' })
      recordHistogram(AgentMetrics.X402_PAYMENT_AMOUNT, receipt.amountUsd, { chain })
      timer.stop()
      
      return await api.json({ ok: true, receipt, subscriptionProof }, undefined, { event: 'x402.settle.mock', paymentRef, subscriptionId })
    }

    // Agent Passport gate: if the payment is made on behalf of an agent, it may
    // settle only when the agent holds a valid on-chain passport whose proven
    // (hidden) spend cap covers the quoted amount. See lib/passport/passport.ts.
    if (agentId) {
      addSpanEvent(settlementSpan, 'passport_gate_check', { agentId, amountUnits: quote?.amountUnits })
      
      if (!quote) {
        addSpanEvent(settlementSpan, 'quote_not_found', { paymentRef })
        finishSpan(settlementSpan, 'error')
        incrementCounter(AgentMetrics.X402_PAYMENTS_FAILED, 1, { reason: 'quote_not_found', chain })
        timer.stop()
        
        return await api.json(
          { ok: false, error: 'Quote not found for paymentRef' },
          { status: 400 },
          { event: 'x402.settle.rejected', reason: 'quote_not_found', paymentRef, chain, agentId },
        )
      }
      
      const gate = await authorizePayment(agentId, quote.amountUnits)
      addSpanEvent(settlementSpan, 'passport_gate_result', { authorized: gate.authorized, reason: gate.reason })
      
      if (!gate.authorized) {
        finishSpan(settlementSpan, 'error')
        incrementCounter(AgentMetrics.X402_PAYMENTS_FAILED, 1, { reason: 'passport_denied', chain })
        timer.stop()
        
        return await api.report(
          'warn',
          new Error(gate.reason),
          { ok: false, error: `Passport gate: ${gate.reason}`, gate },
          { status: 402 },
          { event: 'x402.settle.passport_denied', reason: gate.reason, paymentRef, chain, agentId, cap: gate.cap },
        )
      }
    }

    const result = await settleX402({
      paymentRef,
      chain,
      txHash: String(body.txHash || ''),
      paidBy,
      agentId,
    })

    if (!result.ok || !result.receipt) {
      addSpanEvent(settlementSpan, 'settlement_failed', { error: result.error })
      finishSpan(settlementSpan, 'error')
      incrementCounter(AgentMetrics.X402_PAYMENTS_FAILED, 1, { reason: 'settlement_rejected', chain })
      timer.stop()
      
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
      addSpanEvent(settlementSpan, 'subscription_recorded', { subscriptionId })
    }

    publishSystemEvent({
      type: 'payment.received',
      agentId: agentId || paidBy,
      receipt: result.receipt,
    })
    awardXP(agentId || paidBy, XP_AWARDS.X402_PAYMENT_RECEIVED, 'payment.received')
    
    addSpanEvent(settlementSpan, 'settlement_completed', { txHash: result.receipt.txHash, amountUsd: result.receipt.amountUsd })
    finishSpan(settlementSpan, 'ok')
    incrementCounter(AgentMetrics.X402_PAYMENTS_SETTLED, 1, { chain })
    recordHistogram(AgentMetrics.X402_PAYMENT_AMOUNT, result.receipt.amountUsd, { chain })
    timer.stop()

    return await api.json({ ok: true, receipt: result.receipt, subscriptionProof }, undefined, {
      event: 'x402.settle.completed',
      paymentRef,
      chain,
      paidBy,
      txHash: result.receipt.txHash,
      subscriptionId,
    })
  } catch (error) {
    addSpanEvent(settlementSpan, 'error', {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
      } : String(error),
    })
    finishSpan(settlementSpan, 'error')
    incrementCounter(AgentMetrics.X402_PAYMENTS_FAILED, 1, { reason: 'exception', chain: 'unknown' })
    timer.stop()
    
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed settling x402 payment' },
      { status: 500 },
      { event: 'x402.settle.failed' },
    )
  }
}, { keyType: 'protocol' })
