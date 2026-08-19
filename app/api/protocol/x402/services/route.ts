import { createApiRouteLogger } from '@/lib/api-logging'
import { listMarketplaceServices } from '@/lib/marketplace/services'

export async function GET(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/x402/services')
  try {
    const rawServices = listMarketplaceServices()
    const services = rawServices.map((service) => ({
      ...service,
      unitPriceUsd: Number((service.priceXlm * 0.1).toFixed(4)),
      supportedChains: ['stellar', 'bnb', 'base'],
      plans: [
        { plan: 'starter', pricePerMonth: '1 XLM', callsPerMonth: 100 },
        { plan: 'growth', pricePerMonth: '5 XLM', callsPerMonth: 1000 },
        { plan: 'pro', pricePerMonth: '20 XLM', callsPerMonth: 10000 },
      ],
    }))

    return await api.json(
      { ok: true, services },
      undefined,
      { event: 'x402.services.listed', count: services.length }
    )
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed listing x402 services' },
      { status: 500 },
      { event: 'x402.services.failed' }
    )
  }
}
