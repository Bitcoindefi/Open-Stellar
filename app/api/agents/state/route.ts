import { NextResponse } from 'next/server'
import { listAgentStates, upsertAgentState, type PersistedAgentState } from '@/lib/agents/agent-state-store'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ ok: true, agents: await listAgentStates() }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as PersistedAgentState
    const agent = await upsertAgentState(body)
    return NextResponse.json({ ok: true, agent }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Failed to save agent state' }, { status: 400 })
  }
}
