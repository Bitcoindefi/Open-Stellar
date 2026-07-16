import { NextResponse } from 'next/server'
import { createApiRouteLogger } from '@/lib/api-logging'
import {
  invokeSkillWithPayment,
  type SkillInvocationRequest,
} from '@/lib/marketplace/x402-middleware'
import {
  recordInvocation,
  updateInvocationStatus,
} from '@/lib/marketplace/invocation-ledger'
import { getSkill, incrementSkillInvocation } from '@/lib/marketplace/skill-registry'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ skillId: string }> },
) {
  const { skillId } = await params
  const api = createApiRouteLogger(request, `/api/marketplace/skills/${skillId}/invoke`)

  try {
    const body = (await request.json()) as Partial<SkillInvocationRequest>

    if (!body.agentId || typeof body.agentId !== 'string') {
      return await api.json(
        { ok: false, error: 'agentId is required' },
        { status: 400 },
        { event: 'skill.invoke.rejected', reason: 'missing_agent_id', skillId },
      )
    }

    const skill = getSkill(skillId)

    if (!skill) {
      return await api.json(
        { ok: false, error: 'skill_not_found' },
        { status: 404 },
        { event: 'skill.invoke.rejected', reason: 'skill_not_found', skillId, agentId: body.agentId },
      )
    }

    if (!skill.active) {
      return await api.json(
        { ok: false, error: 'skill_inactive' },
        { status: 403 },
        { event: 'skill.invoke.rejected', reason: 'skill_inactive', skillId, agentId: body.agentId },
      )
    }

    // Record invocation attempt
    const invocation = recordInvocation(
      body.agentId,
      skillId,
      skill.priceXLM,
      '',
      skill.callUrl,
      body.payload,
    )

    // Execute payment + invocation
    const result = await invokeSkillWithPayment(
      {
        id: skill.id,
        agentId: skill.ownerAgentId,
        callUrl: skill.callUrl,
        priceXLM: skill.priceXLM,
        ownerWallet: skill.ownerWallet,
        name: skill.name,
        description: skill.description,
      },
      {
        agentId: body.agentId,
        payload: body.payload,
        payerWallet: body.payerWallet,
      },
      api,
    )

    // Update ledger
    if (result.ok && result.paymentProof) {
      updateInvocationStatus(invocation.id, 'success', undefined, JSON.stringify(result.paymentProof))
      invocation.txHash = result.paymentProof.txHash
      invocation.status = 'success'
      incrementSkillInvocation(skillId)
    } else {
      updateInvocationStatus(invocation.id, 'failed', result.error)
    }

    if (!result.ok && result.error === 'insufficient_balance') {
      return await api.json(
        { ok: false, error: 'insufficient_balance' },
        { status: 402 },
        {
          event: 'skill.invoke.failed',
          reason: 'insufficient_balance',
          skillId,
          agentId: body.agentId,
          amountXLM: skill.priceXLM,
        },
      )
    }

    if (!result.ok) {
      return await api.json(
        { ok: false, error: result.error || 'invocation_failed' },
        { status: result.status || 500 },
        {
          event: 'skill.invoke.failed',
          reason: result.error || 'unknown',
          skillId,
          agentId: body.agentId,
        },
      )
    }

    return await api.json(
      {
        ok: true,
        data: result.data,
        paymentProof: result.paymentProof,
        invocationId: invocation.id,
      },
      { status: 200 },
      {
        event: 'skill.invoke.success',
        skillId,
        agentId: body.agentId,
        txHash: result.paymentProof?.txHash,
        amountXLM: skill.priceXLM,
      },
    )
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
      { event: 'skill.invoke.error', skillId, error: error instanceof Error ? error.message : 'unknown' },
    )
  }
}