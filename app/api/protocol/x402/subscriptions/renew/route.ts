import { createApiRouteLogger } from '@/lib/api-logging'
import { renewX402Subscriptions } from '@/lib/protocols/x402'

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/x402/subscriptions/renew')

  try {
    const body = await req.json().catch(() => ({}))
    const balances = (body.balances && typeof body.balances === 'object')
      ? (body.balances as Record<string, number>)
      : {}

    const result = renewX402Subscriptions(new Date(), balances)

    return await api.json(
      {
        ok: true,
        renewedCount: result.renewed.length,
        pausedCount: result.paused.length,
        renewed: result.renewed,
        paused: result.paused,
      },
      undefined,
      {
        event: 'x402.subscriptions.renewed',
        renewedCount: result.renewed.length,
        pausedCount: result.paused.length,
      },
    )
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed renewing x402 subscriptions' },
      { status: 500 },
      { event: 'x402.subscriptions.renew_failed' },
    )
  }
}
