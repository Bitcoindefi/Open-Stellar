import { createApiRouteLogger } from '@/lib/api-logging'
import { applyReputationActionAsync, getReputationAsync, listReputationsAsync } from '@/lib/reputation/reputation-store'

export async function GET(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/reputation')
  const { searchParams } = new URL(req.url)
  const actorId = searchParams.get('actorId')

  if (actorId) {
    return await api.json({ ok: true, reputation: await getReputationAsync(actorId) }, undefined, {
      event: 'reputation.read',
      actorId,
    })
  }

  const reputations = await listReputationsAsync()
  return await api.json({ ok: true, reputations }, undefined, {
    event: 'reputation.list',
    count: reputations.length,
  })
}

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/reputation')

  try {
    const body = await req.json()
    const actorId = String(body.actorId || 'anonymous')
    const delta = Number(body.delta || 0)
    const reason = String(body.reason || 'manual-update')
    const scope = body.scope === 'governance' || body.scope === 'service' ? body.scope : 'tx'
    const updated = await applyReputationActionAsync({ actorId, delta, reason, scope })

    return await api.json({ ok: true, reputation: updated }, undefined, {
      event: 'reputation.updated',
      actorId,
      delta,
      reason,
      scope,
      score: updated.score,
    })
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed updating reputation' },
      { status: 500 },
      { event: 'reputation.update.failed' },
    )
  }
}
