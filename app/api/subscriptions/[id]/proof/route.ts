import { createApiRouteLogger } from '@/lib/api-logging'
import { getSubscriptionPaymentProof } from '@/lib/protocols/subscription-anchor'

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

export async function GET(req: Request, context: RouteContext) {
  const api = createApiRouteLogger(req, '/api/subscriptions/[id]/proof')
  const { id } = await context.params
  const proof = getSubscriptionPaymentProof(id)

  if (!proof) {
    return await api.json(
      { ok: false, error: 'Subscription proof not found' },
      { status: 404 },
      { event: 'subscription.proof.not_found', subscriptionId: id },
    )
  }

  return await api.json({ ok: true, ...proof }, undefined, {
    event: 'subscription.proof.read',
    subscriptionId: proof.subscriptionId,
    isActive: proof.isActive,
    lastPaymentLedger: proof.lastPaymentLedger,
    contractId: proof.contractId,
  })
}
