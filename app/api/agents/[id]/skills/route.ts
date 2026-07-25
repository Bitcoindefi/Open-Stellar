import { NextResponse } from 'next/server'
import { listAgentSkills, registerSkill } from '@/lib/skills/skills-registry'
import { createApiRouteLogger } from '@/lib/api-logging'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)

  try {
    const skills = listAgentSkills(agentId)
    return NextResponse.json(
      { ok: true, skills },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed to list skills' },
      { status: 500 },
    )
  }
}

export async function POST(req: Request, context: RouteContext) {
  const api = createApiRouteLogger(req, '/api/agents/[id]/skills')
  const { id } = await context.params
  const agentId = decodeURIComponent(id)

  try {
    const body = await req.json()

    const skill = registerSkill({
      skillId: String(body.skillId || ''),
      agentId,
      name: String(body.name || ''),
      description: String(body.description || ''),
      priceXlm: Number(body.priceXlm || 0),
      endpoint: String(body.endpoint || ''),
    })

    return await api.json(
      { ok: true, skill },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
      {
        event: 'skill.registered',
        agentId,
        skillId: skill.skillId,
        priceXlm: skill.priceXlm,
      },
    )
  } catch (error) {
    return await api.report(
      'error',
      error,
      { ok: false, error: error instanceof Error ? error.message : 'Failed to register skill' },
      { status: 400 },
      { event: 'skill.registration.failed', agentId },
    )
  }
}
