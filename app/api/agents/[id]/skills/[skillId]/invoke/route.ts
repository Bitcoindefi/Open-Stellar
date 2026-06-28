import { NextResponse } from 'next/server'
import { getSkill } from '@/lib/skills/skills-registry'
import { createX402Quote, settleX402 } from '@/lib/protocols/x402'
import { createApiRouteLogger } from '@/lib/api-logging'

interface RouteContext {
  params: Promise<{ id: string; skillId: string }>
}

export async function GET(req: Request, context: RouteContext) {
  const api = createApiRouteLogger(req, '/api/agents/[id]/skills/[skillId]/invoke')
  const { id, skillId } = await context.params
  const agentId = decodeURIComponent(id)
  const decodedSkillId = decodeURIComponent(skillId)

  try {
    const skill = getSkill(agentId, decodedSkillId)

    if (!skill) {
      return await api.json(
        { ok: false, error: 'Skill not found' },
        { status: 404 },
        { event: 'skill.invoke.not_found', agentId, skillId: decodedSkillId },
      )
    }

    const url = new URL(req.url)
    const payer = url.searchParams.get('payer') ?? 'anonymous'
    const chain = url.searchParams.get('chain') ?? 'stellar'

    if (chain !== 'stellar' && chain !== 'bnb' && chain !== 'base') {
      return await api.json(
        { ok: false, error: 'Invalid chain parameter' },
        { status: 400 },
        { event: 'skill.invoke.invalid_chain', agentId, skillId: decodedSkillId, chain },
      )
    }

    // Create x402 payment challenge
    const quote = createX402Quote({
      serviceId: `skill:${agentId}:${decodedSkillId}`,
      chain,
      payer,
      units: 1,
      unitPriceUsd: skill.priceXlm * 0.1, // Assuming XLM = $0.10 USD
      ttlSeconds: 300,
    })

    return await api.json(
      quote,
      { status: 402 },
      {
        event: 'skill.invoke.payment_required',
        agentId,
        skillId: decodedSkillId,
        priceXlm: skill.priceXlm,
        paymentRef: quote.paymentRef,
      },
    )
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed to create payment challenge' },
      { status: 500 },
      { event: 'skill.invoke.failed', agentId, skillId: decodedSkillId },
    )
  }
}

export async function POST(req: Request, context: RouteContext) {
  const api = createApiRouteLogger(req, '/api/agents/[id]/skills/[skillId]/invoke')
  const { id, skillId } = await context.params
  const agentId = decodeURIComponent(id)
  const decodedSkillId = decodeURIComponent(skillId)

  try {
    const skill = getSkill(agentId, decodedSkillId)

    if (!skill) {
      return await api.json(
        { ok: false, error: 'Skill not found' },
        { status: 404 },
        { event: 'skill.invoke.not_found', agentId, skillId: decodedSkillId },
      )
    }

    const body = await req.json()
    const paymentRef = String(body.paymentRef || body.quoteId || '')
    const txHash = String(body.txHash || '')
    const chain = body.chain === 'bnb' || body.chain === 'base' || body.chain === 'stellar' ? body.chain : 'stellar'
    const paidBy = String(body.paidBy || 'anonymous')

    if (!paymentRef) {
      return await api.json(
        { ok: false, error: 'paymentRef or quoteId is required' },
        { status: 400 },
        { event: 'skill.invoke.missing_payment_ref', agentId, skillId: decodedSkillId },
      )
    }

    if (!txHash) {
      return await api.json(
        { ok: false, error: 'txHash is required' },
        { status: 400 },
        { event: 'skill.invoke.missing_tx_hash', agentId, skillId: decodedSkillId },
      )
    }

    // Verify payment
    const result = settleX402({
      paymentRef,
      chain,
      txHash,
      paidBy,
      agentId,
    })

    if (!result.ok || !result.receipt) {
      return await api.json(
        { ok: false, error: 'Payment verification failed' },
        { status: 402 },
        {
          event: 'skill.invoke.payment_rejected',
          agentId,
          skillId: decodedSkillId,
          reason: result.error,
        },
      )
    }

    // Payment successful - call agent's endpoint
    try {
      const payload = body.payload || {}
      const agentResponse = await fetch(skill.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payment-Ref': paymentRef,
          'X-Paid-By': paidBy,
          'X-Skill-Id': decodedSkillId,
        },
        body: JSON.stringify(payload),
      })

      const agentResult = await agentResponse.json()

      return await api.json(
        {
          ok: true,
          receipt: result.receipt,
          result: agentResult,
        },
        undefined,
        {
          event: 'skill.invoked',
          agentId,
          skillId: decodedSkillId,
          paidBy,
          txHash: result.receipt.txHash,
          priceXlm: skill.priceXlm,
        },
      )
    } catch (endpointError) {
      return await api.report(
        'error',
        endpointError,
        {
          ok: false,
          error: 'Skill endpoint invocation failed',
          receipt: result.receipt,
        },
        { status: 500 },
        {
          event: 'skill.endpoint.failed',
          agentId,
          skillId: decodedSkillId,
          endpoint: skill.endpoint,
        },
      )
    }
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed to invoke skill' },
      { status: 500 },
      { event: 'skill.invoke.failed', agentId, skillId: decodedSkillId },
    )
  }
}
