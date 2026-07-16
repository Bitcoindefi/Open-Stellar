import { createApiRouteLogger } from '@/lib/api-logging'
import { authorizePayment } from '@/lib/passport/passport'
import { withApiKeyAuth } from '@/lib/auth/api-key-middleware'
import { createSpan, addSpanEvent, finishSpan } from '@/lib/observability/tracing'
import { incrementCounter, Timer, AgentMetrics } from '@/lib/observability/metrics'

// POST { agentId, amount } -> on-chain spend-cap gate for the agent's passport.
// `amount` is in the smallest on-chain unit (must already be scaled by caller).
export const POST = withApiKeyAuth(async (req: Request) => {
  const api = createApiRouteLogger(req, '/api/protocol/passport/authorize')
  const timer = new Timer(AgentMetrics.PASSPORT_VERIFICATION_DURATION, {}, 'Duration of passport authorization check')
  const authSpan = createSpan('passport.authorize', { path: '/api/protocol/passport/authorize' })

  try {
    const body = await req.json()
    const agentId = String(body.agentId || '')
    const amount = String(body.amount || '')

    authSpan.attributes = { agentId, amount }

    if (!agentId || !amount) {
      addSpanEvent(authSpan, 'validation_failed', { reason: 'missing_parameters' })
      finishSpan(authSpan, 'error')
      incrementCounter(AgentMetrics.PASSPORT_AUTHORIZE_DENIED, 1, { reason: 'missing_parameters' })
      timer.stop()
      
      return await api.json(
        { ok: false, error: 'agentId and amount are required' },
        { status: 400 },
        { reason: 'missing_agentId_or_amount' },
      )
    }

    addSpanEvent(authSpan, 'authorization_check', { agentId, amount })
    const result = await authorizePayment(agentId, amount)
    
    addSpanEvent(authSpan, 'authorization_result', { authorized: result.authorized, reason: result.reason, cap: result.cap })
    
    if (result.authorized) {
      incrementCounter(AgentMetrics.PASSPORT_AUTHORIZE, 1, { status: 'authorized' })
    } else {
      incrementCounter(AgentMetrics.PASSPORT_AUTHORIZE_DENIED, 1, { reason: result.reason })
    }
    
    finishSpan(authSpan, 'ok')
    timer.stop()
    
    return await api.json({ ok: true, ...result }, undefined, {
      event: 'passport.authorize.completed',
      agentId,
      amount,
      authorized: result.authorized,
      reason: result.reason,
      cap: result.cap,
    })
  } catch (error) {
    addSpanEvent(authSpan, 'error', {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
      } : String(error),
    })
    finishSpan(authSpan, 'error')
    incrementCounter(AgentMetrics.PASSPORT_AUTHORIZE_DENIED, 1, { reason: 'exception' })
    timer.stop()
    
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed authorizing payment' },
      { status: 500 },
      { event: 'passport.authorize.failed' },
    )
  }
}, { keyType: 'protocol' })
