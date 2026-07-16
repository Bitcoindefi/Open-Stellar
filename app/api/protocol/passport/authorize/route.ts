import { createApiRouteLogger } from '@/lib/api-logging'
import { authorizePayment } from '@/lib/passport/passport'
import { withApiKeyAuth } from '@/lib/auth/api-key-middleware'

// POST { agentId, amount } -> on-chain spend-cap gate for the agent's passport.
// `amount` is in the smallest on-chain unit (must already be scaled by caller).
export const POST = withApiKeyAuth(async (req: Request) => {
  const api = createApiRouteLogger(req, '/api/protocol/passport/authorize')

  try {
    const body = await req.json()
    const agentId = String(body.agentId || '')
    const amount = String(body.amount || '')

    if (!agentId || !amount) {
      return await api.json(
        { ok: false, error: 'agentId and amount are required' },
        { status: 400 },
        { reason: 'missing_agentId_or_amount' },
      )
    }

    const result = await authorizePayment(agentId, amount)
    return await api.json({ ok: true, ...result }, undefined, {
      event: 'passport.authorize.completed',
      agentId,
      amount,
      authorized: result.authorized,
      reason: result.reason,
      cap: result.cap,
    })
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed authorizing payment' },
      { status: 500 },
      { event: 'passport.authorize.failed' },
    )
  }
}, { keyType: 'protocol' })
