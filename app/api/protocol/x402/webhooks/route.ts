import { timingSafeEqual } from 'node:crypto'
import { createApiRouteLogger } from '@/lib/api-logging'
import {
  dispatchX402SettlementWebhook,
  listX402WebhookDeliveries,
} from '@/lib/protocols/x402-webhooks'

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET || process.env.X402_ADMIN_SECRET || ''
  if (!secret) {
    // Fail closed in production when no secret is set. Never trust Host header.
    return process.env.NODE_ENV !== 'production'
  }

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
  const adminHeader = req.headers.get('X-Admin-Secret') || req.headers.get('x-admin-secret') || ''

  return safeCompare(authHeader, `Bearer ${secret}`) || safeCompare(adminHeader, secret)
}

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

  if (!isAuthorized(req)) {
    return await api.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
      { event: 'x402.webhooks.unauthorized' },
    )
  }

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

    const log = await dispatchX402SettlementWebhook(receipt, targetUrl, { publishToEventBus: false })
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
      { status: 400 },
      { event: 'x402.webhooks.failed' },
    )
  }
}
