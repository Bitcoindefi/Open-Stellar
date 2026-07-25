import { NextResponse } from 'next/server'
import { createApiRouteLogger } from '@/lib/api-logging'
import { getPassport, isRegistered } from '@/lib/passport/passport'
import { isMockMode } from '@/lib/mock/mock-mode'
import { mockPassport } from '@/lib/mock/passport-mock'

// GET /api/protocol/passport/status?agentId=...  -> on-chain passport lookup.
export async function GET(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/passport/status')

  try {
    const agentId = new URL(req.url).searchParams.get('agentId')
    if (!agentId) {
      return await api.json(
        { ok: false, error: 'agentId query param is required' },
        { status: 400 },
        { reason: 'missing_agentId' },
      )
    }

    if (isMockMode()) {
      return NextResponse.json({ ok: true, ...(await mockPassport.getStatus(agentId)) })
    }

    const [registered, attestation] = await Promise.all([
      isRegistered(agentId),
      getPassport(agentId),
    ])

    return await api.json({ ok: true, registered, attestation: attestation ?? null }, undefined, {
      event: 'passport.status.read',
      agentId,
      registered,
      hasAttestation: Boolean(attestation),
    })
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed reading passport status' },
      { status: 500 },
      { event: 'passport.status.failed' },
    )
  }
}
