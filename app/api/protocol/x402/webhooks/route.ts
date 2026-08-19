import { createApiRouteLogger } from '@/lib/api-logging'
import {
  deleteX402Webhook,
  listX402Webhooks,
  registerX402Webhook,
} from '@/lib/protocols/x402-webhook-store'

export async function GET(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/x402/webhooks')
  try {
    const { searchParams } = new URL(req.url)
    const serviceId = searchParams.get('serviceId') || undefined
    const webhooks = listX402Webhooks(serviceId)

    return await api.json(
      { ok: true, webhooks },
      undefined,
      { event: 'x402.webhooks.listed', count: webhooks.length }
    )
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed listing webhooks' },
      { status: 500 },
      { event: 'x402.webhooks.list_failed' }
    )
  }
}

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/x402/webhooks')
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('x-api-key') || req.headers.get('x-agent-id')
    if (!authHeader && process.env.NODE_ENV === 'production') {
      return await api.json(
        { ok: false, error: 'Authentication required to register webhooks' },
        { status: 401 },
        { event: 'x402.webhook.unauthorized' }
      )
    }

    const body = await req.json()
    const webhook = registerX402Webhook({
      serviceId: String(body.serviceId || ''),
      url: String(body.url || ''),
      secret: body.secret ? String(body.secret) : undefined,
    })

    return await api.json(
      { ok: true, webhook },
      { status: 201 },
      { event: 'x402.webhook.registered', webhookId: webhook.id, serviceId: webhook.serviceId }
    )
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed registering webhook' },
      { status: 400 },
      { event: 'x402.webhook.registration_failed' }
    )
  }
}

export async function DELETE(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/x402/webhooks')
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return await api.json({ ok: false, error: 'Webhook id query parameter is required' }, { status: 400 })
    }

    const removed = deleteX402Webhook(id)
    if (!removed) {
      return await api.json({ ok: false, error: 'Webhook not found' }, { status: 404 })
    }

    return await api.json(
      { ok: true, removed: true },
      undefined,
      { event: 'x402.webhook.deleted', webhookId: id }
    )
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed deleting webhook' },
      { status: 500 },
      { event: 'x402.webhook.delete_failed' }
    )
  }
}
