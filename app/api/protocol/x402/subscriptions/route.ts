import { createApiRouteLogger } from '@/lib/api-logging'
import { createX402Subscription, listX402Subscriptions, type X402SubscriptionPlan } from '@/lib/protocols/x402'

function normalizePlan(plan: unknown): X402SubscriptionPlan {
  const value = String(plan || 'monthly').toLowerCase()
  if (value === 'starter' || value === 'growth' || value === 'pro' || value === 'custom' || value === 'monthly') {
    return value
  }
  return 'monthly'
}

export async function GET(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/x402/subscriptions')
  return await api.json({ ok: true, ...listX402Subscriptions() }, undefined, { event: 'x402.subscriptions.listed' })
}

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/x402/subscriptions')

  try {
    const body = await req.json()
    const subscription = createX402Subscription({
      serviceId: String(body.serviceId || ''),
      agentId: String(body.agentId || ''),
      plan: normalizePlan(body.plan),
      callsPerMonth: body.callsPerMonth === undefined ? undefined : Number(body.callsPerMonth),
      pricePerMonth: body.pricePerMonth ? String(body.pricePerMonth) : undefined,
      walletBalanceXlm: body.walletBalanceXlm === undefined ? undefined : Number(body.walletBalanceXlm),
    })

    return await api.json({ ok: true, subscription }, { status: 201 }, {
      event: 'x402.subscription.created',
      serviceId: subscription.serviceId,
      agentId: subscription.agentId,
      plan: subscription.plan,
      pricePerMonth: subscription.pricePerMonth,
    })
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed creating x402 subscription' },
      { status: 400 },
      { event: 'x402.subscription.failed' },
    )
  }
}
