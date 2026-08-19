import { createApiRouteLogger } from '@/lib/api-logging'
import {
  dispatchX402SettlementWebhook,
  listX402WebhookDeliveries,
} from '@/lib/protocols/x402-webhooks'

export async function GET(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/x402/webhooks')
  const deliveries = listX402WebhookDeliveries()
  return await api.json(
    { ok: true, deliveries, total: deliveries.length },
    undefined,
    { event: 'x402.webhooks.listed', count: deliveries.length },
  )
}

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/x402/webhooks')

  try {
    const body = await req.json()
    const targetUrl = body.targetUrl ? String(body.targetUrl) : undefined
    const receipt = body.receipt

    if (!receipt || typeof receipt !== 'object') {
      return await api.json(
        { ok: false, error: 'receipt object is required' },
        { status: 400 },
        { event: 'x402.webhooks.rejected', reason: 'missing_receipt' },
      )
    }

    const log = await dispatchX402SettlementWebhook(receipt, targetUrl)
    return await api.json(
      { ok: true, delivery: log },
      { status: 201 },
      { event: 'x402.webhooks.dispatched', targetUrl: log.targetUrl, deliveryStatus: log.status },
    )
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed to dispatch x402 webhook' },
      { status: 500 },
      { event: 'x402.webhooks.failed' },
    )
  }
}
