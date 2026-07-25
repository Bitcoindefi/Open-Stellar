import { createApiRouteLogger } from '@/lib/api-logging'
import { createLocalReputationAttestation, verifyLocalReputationAttestation } from '@/lib/reputation/attestation'
import { getReputation } from '@/lib/reputation/reputation-store'

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/reputation/attestation')

  try {
    const body = await req.json()
    const actorId = String(body.actorId || 'anonymous')
    const contractId = body.contractId ? String(body.contractId) : undefined
    const reputation = getReputation(actorId)
    const attestation = createLocalReputationAttestation(reputation, contractId)

    return await api.json({ ok: true, reputation, attestation }, undefined, {
      event: 'reputation.attestation.minted',
      actorId,
      score: reputation.score,
      hash: attestation.hash,
    })
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed minting reputation attestation' },
      { status: 500 },
      { event: 'reputation.attestation.failed' },
    )
  }
}

export async function PUT(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/reputation/attestation')

  try {
    const body = await req.json()
    const actorId = String(body.actorId || 'anonymous')
    const minScore = Number(body.minScore || 0)
    const verified = verifyLocalReputationAttestation(actorId, minScore, body.attestation)

    return await api.json({ ok: true, verified }, undefined, {
      event: 'reputation.attestation.verified',
      actorId,
      minScore,
      verified,
    })
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed verifying reputation attestation' },
      { status: 500 },
      { event: 'reputation.attestation.verify.failed' },
    )
  }
}
