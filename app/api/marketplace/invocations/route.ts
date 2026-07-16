import { createApiRouteLogger } from '@/lib/api-logging'
import { listInvocations, getInvocationStats } from '@/lib/marketplace/invocation-ledger'

export async function GET(request: Request) {
  const api = createApiRouteLogger(request, '/api/marketplace/invocations')
  const url = new URL(request.url)

  try {
    const agentId = url.searchParams.get('agentId') || undefined
    const skillId = url.searchParams.get('skillId') || undefined
    const txHash = url.searchParams.get('txHash') || undefined
    const status = url.searchParams.get('status') as 'pending' | 'success' | 'failed' | undefined
    const since = url.searchParams.get('since') || undefined
    const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined

    const invocations = listInvocations({
      agentId,
      skillId,
      txHash,
      status,
      since,
      limit,
    })

    const stats = getInvocationStats(skillId)

    return await api.json(
      {
        ok: true,
        invocations,
        stats,
        count: invocations.length,
      },
      { status: 200 },
      {
        event: 'skill.invocations.listed',
        agentId,
        skillId,
        count: invocations.length,
      },
    )
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed to list invocations' },
      { status: 500 },
      { event: 'skill.invocations.error' },
    )
  }
}