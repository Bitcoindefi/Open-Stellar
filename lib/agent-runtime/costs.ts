export interface ClaudeCostRecord {
  id: string
  taskId: string
  agentId: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  createdAt: string
}

const MODEL_PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-opus-4-5": { input: 5, output: 25 },
  "claude-4-opus": { input: 15, output: 75 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-4-sonnet": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-3.5-haiku": { input: 0.8, output: 4 },
}

const globalState = globalThis as typeof globalThis & {
  __openStellarClaudeCostRecords__?: ClaudeCostRecord[]
}

function records(): ClaudeCostRecord[] {
  if (!globalState.__openStellarClaudeCostRecords__) globalState.__openStellarClaudeCostRecords__ = []
  return globalState.__openStellarClaudeCostRecords__
}

function priceForModel(model: string) {
  const key = Object.keys(MODEL_PRICES_PER_MILLION).find((candidate) => model.includes(candidate))
  return MODEL_PRICES_PER_MILLION[key ?? "claude-4-sonnet"]
}

export function estimateClaudeCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = priceForModel(model)
  return Number(((inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output).toFixed(6))
}

export function recordClaudeTaskCost(input: Omit<ClaudeCostRecord, "id" | "createdAt" | "costUsd">): ClaudeCostRecord {
  const costUsd = estimateClaudeCostUsd(input.model, input.inputTokens, input.outputTokens)
  const record: ClaudeCostRecord = {
    ...input,
    id: `claude_cost_${Date.now()}_${records().length + 1}`,
    costUsd,
    createdAt: new Date().toISOString(),
  }
  records().unshift(record)
  return record
}

export function listClaudeCostRecords(agentId?: string): ClaudeCostRecord[] {
  return records().filter((record) => !agentId || record.agentId === agentId)
}

export function getAgentClaudeAnalytics(agentId: string, dailyBudgetUsd = 5) {
  const agentRecords = listClaudeCostRecords(agentId)
  const since = Date.now() - 24 * 60 * 60 * 1000
  const dailySpendUsd = agentRecords
    .filter((record) => Date.parse(record.createdAt) >= since)
    .reduce((sum, record) => sum + record.costUsd, 0)
  const lifetimeSpendUsd = agentRecords.reduce((sum, record) => sum + record.costUsd, 0)

  return {
    agentId,
    taskCount: agentRecords.length,
    dailySpendUsd: Number(dailySpendUsd.toFixed(6)),
    lifetimeSpendUsd: Number(lifetimeSpendUsd.toFixed(6)),
    dailyBudgetUsd,
    overDailyBudget: dailySpendUsd > dailyBudgetUsd,
  }
}

export function resetClaudeCostRecordsForTests(): void {
  globalState.__openStellarClaudeCostRecords__ = []
}
