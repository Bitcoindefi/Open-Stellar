import { createApiRouteLogger } from '@/lib/api-logging'
import { checkX402Subscription } from '@/lib/protocols/x402'

type RouteContext = {
  params: Promise<{
    agentId: string
    serviceId: string
  }>
}

export async function GET(req: Request, context: RouteContext) {
  const api = createApiRouteLogger(req, '/api/protocol/x402/subscriptions/[agentId]/[serviceId]')
  const { agentId, serviceId } = await context.params
  const url = new URL(req.url)
  const access = checkX402Subscription(agentId, serviceId, {
    consumeCall: url.searchParams.get('consume') === 'true',
  })

  return await api.json(access, { status: access.active ? 200 : 402 }, {
    event: 'x402.subscription.checked',
    agentId,
    serviceId,
    active: access.active,
    subscriptionStatus: access.status,
  })
}
