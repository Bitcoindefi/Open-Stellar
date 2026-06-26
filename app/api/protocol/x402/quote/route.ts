import { createApiRouteLogger } from '@/lib/api-logging'
import { createX402Quote } from '@/lib/protocols/x402'

export async function POST(req: Request) {
  const api = createApiRouteLogger(req, '/api/protocol/x402/quote')

  try {
    const body = await req.json()
    const serviceId = String(body.serviceId || 'ai-agent-service')
    const chain = body.chain === 'stellar' ? 'stellar' : 'bnb'
    const payer = String(body.payer || 'anonymous')
    const quote = createX402Quote({
      serviceId,
      chain,
      payer,
      units: Number(body.units || 1),
      unitPriceUsd: Number(body.unitPriceUsd || 0.1),
      ttlSeconds: Number(body.ttlSeconds || 300),
      reputationGate: body.minReputation ? {
        minReputation: Number(body.minReputation),
        tier: body.tier ? String(body.tier) : undefined,
      } : undefined,
      attestation: body.attestation,
    })

    return await api.json({ ok: true, quote }, undefined, {
      event: 'x402.quote.created',
      serviceId,
      chain,
      payer,
      amountUsd: quote.amountUsd,
      paymentRef: quote.paymentRef,
    })
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed generating x402 quote' },
      { status: 500 },
      { event: 'x402.quote.failed' },
    )
  }
}
