import { isPostgresConfigured, sql } from '@/lib/db/postgres'
import { createAgents } from '@/lib/data'
import type { AgentStatus, DistrictId } from '@/lib/types'

export interface PersistedAgentState {
  id: string
  name: string
  model: string
  district: DistrictId
  status: AgentStatus
  pixelX: number
  pixelY: number
  tasksCompleted: number
  xp: number
  level: number
  walletPublicKey?: string | null
  createdAt?: string
  updatedAt?: string
}

type AgentStateMap = Map<string, PersistedAgentState>
const globalState = globalThis as typeof globalThis & { __openStellarAgentStateStore__?: AgentStateMap }
const memoryAgents = globalState.__openStellarAgentStateStore__ ?? new Map<string, PersistedAgentState>()
if (!globalState.__openStellarAgentStateStore__) globalState.__openStellarAgentStateStore__ = memoryAgents

function seedMemory(): void {
  if (memoryAgents.size > 0) return
  for (const agent of createAgents()) {
    memoryAgents.set(agent.id, { id: agent.id, name: agent.name, model: agent.model, district: agent.district, status: agent.status, pixelX: agent.pixelX, pixelY: agent.pixelY, tasksCompleted: agent.tasksCompleted ?? 0, xp: agent.xp ?? 0, level: agent.level ?? 1, walletPublicKey: null })
  }
}

function rowToAgent(row: { id: string; name: string; model: string; district: DistrictId; status: AgentStatus; pixel_x: number; pixel_y: number; tasks_completed: number; xp: number; level: number; wallet_public_key: string | null; created_at: Date; updated_at: Date }): PersistedAgentState {
  return { id: row.id, name: row.name, model: row.model, district: row.district, status: row.status, pixelX: row.pixel_x, pixelY: row.pixel_y, tasksCompleted: row.tasks_completed, xp: row.xp, level: row.level, walletPublicKey: row.wallet_public_key, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() }
}

export async function listAgentStates(): Promise<PersistedAgentState[]> {
  if (isPostgresConfigured()) {
    const result = await sql<Parameters<typeof rowToAgent>[0]>`SELECT id, name, model, district, status, "pixelX" as pixel_x, "pixelY" as pixel_y, "tasksCompleted" as tasks_completed, xp, level, "walletPublicKey" as wallet_public_key, "createdAt" as created_at, "updatedAt" as updated_at FROM "Agent" ORDER BY id`
    return result.rows.map(rowToAgent)
  }
  seedMemory()
  return [...memoryAgents.values()]
}

export async function upsertAgentState(input: PersistedAgentState): Promise<PersistedAgentState> {
  const agent = { ...input, walletPublicKey: input.walletPublicKey ?? null }
  if (isPostgresConfigured()) {
    const result = await sql<Parameters<typeof rowToAgent>[0]>`INSERT INTO "Agent" (id, name, model, district, status, "pixelX", "pixelY", "tasksCompleted", xp, level, "walletPublicKey") VALUES (${agent.id}, ${agent.name}, ${agent.model}, ${agent.district}, ${agent.status}, ${agent.pixelX}, ${agent.pixelY}, ${agent.tasksCompleted}, ${agent.xp}, ${agent.level}, ${agent.walletPublicKey}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, model = EXCLUDED.model, district = EXCLUDED.district, status = EXCLUDED.status, "pixelX" = EXCLUDED."pixelX", "pixelY" = EXCLUDED."pixelY", "tasksCompleted" = EXCLUDED."tasksCompleted", xp = EXCLUDED.xp, level = EXCLUDED.level, "walletPublicKey" = EXCLUDED."walletPublicKey", "updatedAt" = now() RETURNING id, name, model, district, status, "pixelX" as pixel_x, "pixelY" as pixel_y, "tasksCompleted" as tasks_completed, xp, level, "walletPublicKey" as wallet_public_key, "createdAt" as created_at, "updatedAt" as updated_at`
    return rowToAgent(result.rows[0])
  }
  memoryAgents.set(agent.id, agent)
  return agent
}
