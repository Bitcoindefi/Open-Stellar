import { publishSystemEvent } from '@/lib/events/system-events'

export interface InvocationRecord {
  id: string
  agentId: string
  skillId: string
  amountXLM: number
  txHash: string
  chain: 'stellar' | 'bnb' | 'base'
  invokedAt: string
  status: 'pending' | 'success' | 'failed'
  error?: string
  callUrl: string
  payloadHash: string
  paymentProof?: string
}

const globalState = globalThis as typeof globalThis & {
  __skillInvocationLedger__?: Map<string, InvocationRecord>
}

const ledger: Map<string, InvocationRecord> =
  globalState.__skillInvocationLedger__ ?? new Map()

if (!globalState.__skillInvocationLedger__) {
  globalState.__skillInvocationLedger__ = ledger
}

function generateId(): string {
  return `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function hashPayload(payload: unknown): string {
  // Simple deterministic hash for tracking purposes
  return Buffer.from(JSON.stringify(payload)).toString('base64').slice(0, 32)
}

export function recordInvocation(
  agentId: string,
  skillId: string,
  amountXLM: number,
  txHash: string,
  callUrl: string,
  payload: unknown,
  chain: 'stellar' | 'bnb' | 'base' = 'stellar',
): InvocationRecord {
  const record: InvocationRecord = {
    id: generateId(),
    agentId,
    skillId,
    amountXLM,
    txHash,
    chain,
    invokedAt: new Date().toISOString(),
    status: 'pending',
    callUrl,
    payloadHash: hashPayload(payload),
  }

  ledger.set(record.id, record)
  
  publishSystemEvent({
    type: 'skill.invocation.recorded',
    agentId,
    skillId,
    txHash,
    amountXLM,
  })

  return record
}

export function updateInvocationStatus(
  id: string,
  status: InvocationRecord['status'],
  error?: string,
  paymentProof?: string,
): InvocationRecord | undefined {
  const record = ledger.get(id)
  if (!record) return undefined

  record.status = status
  if (error) record.error = error
  if (paymentProof) record.paymentProof = paymentProof

  ledger.set(id, record)
  return record
}

export function getInvocation(id: string): InvocationRecord | undefined {
  return ledger.get(id)
}

export function listInvocations(filters?: {
  agentId?: string
  skillId?: string
  txHash?: string
  status?: InvocationRecord['status']
  since?: string
  limit?: number
}): InvocationRecord[] {
  let results = Array.from(ledger.values())

  if (filters?.agentId) {
    results = results.filter((r) => r.agentId === filters.agentId)
  }
  if (filters?.skillId) {
    results = results.filter((r) => r.skillId === filters.skillId)
  }
  if (filters?.txHash) {
    results = results.filter((r) => r.txHash === filters.txHash)
  }
  if (filters?.status) {
    results = results.filter((r) => r.status === filters.status)
  }
  if (filters?.since) {
    const sinceTime = new Date(filters.since).getTime()
    results = results.filter((r) => new Date(r.invokedAt).getTime() >= sinceTime)
  }

  // Sort by invokedAt desc
  results.sort((a, b) => new Date(b.invokedAt).getTime() - new Date(a.invokedAt).getTime())

  if (filters?.limit) {
    results = results.slice(0, filters.limit)
  }

  return results
}

export function getInvocationStats(skillId?: string): {
  totalInvocations: number
  totalVolumeXLM: number
  successRate: number
  uniqueAgents: number
} {
  let records = Array.from(ledger.values())
  if (skillId) {
    records = records.filter((r) => r.skillId === skillId)
  }

  const totalInvocations = records.length
  const successful = records.filter((r) => r.status === 'success').length
  const totalVolumeXLM = records.reduce((sum, r) => sum + r.amountXLM, 0)
  const uniqueAgents = new Set(records.map((r) => r.agentId)).size

  return {
    totalInvocations,
    totalVolumeXLM,
    successRate: totalInvocations > 0 ? successful / totalInvocations : 0,
    uniqueAgents,
  }
}

export function resetInvocationLedgerForTests(): void {
  ledger.clear()
}