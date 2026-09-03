import { createApiRouteLogger } from '@/lib/api-logging'
import { listMarketplaceServices } from '@/lib/marketplace/services'

export async function GET(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/x402/services')
  const services = listMarketplaceServices()
  return await api.json(
    { ok: true, services, count: services.length },
    undefined,
    { event: 'x402.services.listed', count: services.length },
  )
}
