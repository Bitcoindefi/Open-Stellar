import type { DistrictId } from "@/lib/types"

export interface OrchestrationBudget {
  maxXLM?: number
  maxTasks?: number
}

export interface PlannedTask {
  step: number
  task: string
  capability: string
  district?: DistrictId
  dep?: number[]
  estimatedCostXlm: number
}

const DEFAULT_MAX_TASKS = 10
const DEFAULT_STEP_COST_XLM = 0.01

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeGoal(goal: unknown): string {
  if (typeof goal !== "string" || goal.trim().length < 8) {
    throw new Error("goal must be a descriptive string")
  }
  return goal.trim().slice(0, 2000)
}

function normalizeBudget(budget: unknown): Required<OrchestrationBudget> {
  const input = isRecord(budget) ? budget : {}
  const maxXLM = Number(input.maxXLM ?? 1)
  const maxTasks = Number(input.maxTasks ?? DEFAULT_MAX_TASKS)

  if (!Number.isFinite(maxXLM) || maxXLM <= 0) throw new Error("budget.maxXLM must be greater than 0")
  if (!Number.isFinite(maxTasks) || maxTasks <= 0) throw new Error("budget.maxTasks must be greater than 0")

  return {
    maxXLM,
    maxTasks: Math.min(DEFAULT_MAX_TASKS, Math.floor(maxTasks)),
  }
}

function normalizeDeadline(deadline: unknown): string | undefined {
  if (deadline === undefined || deadline === null || deadline === "") return undefined
  if (typeof deadline !== "string") throw new Error("deadline must be an ISO timestamp")
  const date = new Date(deadline)
  if (Number.isNaN(date.getTime())) throw new Error("deadline must be an ISO timestamp")
  return date.toISOString()
}

function inferCapability(task: string): string {
  const lower = task.toLowerCase()
  if (lower.includes("log") || lower.includes("fetch") || lower.includes("collect")) return "Log Analysis"
  if (lower.includes("threat") || lower.includes("security") || lower.includes("anomal")) return "Threat Detection"
  if (lower.includes("report") || lower.includes("format") || lower.includes("summar")) return "Data Viz"
  if (lower.includes("payment") || lower.includes("receipt") || lower.includes("cost")) return "Protocol Design"
  return "Batch Processing"
}

function fallbackPlan(goal: string, maxTasks: number): PlannedTask[] {
  const goalLower = goal.toLowerCase()
  const seed: Array<Omit<PlannedTask, "step">> = goalLower.includes("log") || goalLower.includes("threat")
    ? [
        { task: "fetch and normalize relevant log entries", capability: "Log Analysis", district: "data-center", estimatedCostXlm: 0.01 },
        { task: "analyze normalized logs for threats and anomalies", capability: "Threat Detection", district: "defense", dep: [1], estimatedCostXlm: 0.05 },
        { task: "synthesize operator-ready threat report", capability: "Data Viz", district: "research", dep: [2], estimatedCostXlm: 0.01 },
      ]
    : [
        { task: "clarify inputs and gather required context", capability: inferCapability(goal), district: "data-center", estimatedCostXlm: 0.01 },
        { task: `execute primary workflow for: ${goal.slice(0, 96)}`, capability: inferCapability(goal), district: "processing", dep: [1], estimatedCostXlm: 0.03 },
        { task: "validate results and prepare final output", capability: "Data Viz", district: "research", dep: [2], estimatedCostXlm: 0.01 },
      ]

  return seed.slice(0, maxTasks).map((task, index) => ({ ...task, step: index + 1 }))
}

function parsePlannerResponse(value: unknown, maxTasks: number): PlannedTask[] | null {
  if (!isRecord(value) || !Array.isArray(value.plan)) return null
  const tasks = value.plan.slice(0, maxTasks).map((item, index): PlannedTask | null => {
    if (!isRecord(item)) return null
    const task = typeof item.task === "string" ? item.task.trim() : ""
    if (!task) return null
    const dep = Array.isArray(item.dep) ? item.dep.map(Number).filter((depStep) => Number.isInteger(depStep) && depStep > 0 && depStep <= index) : undefined
    return {
      step: index + 1,
      task,
      capability: typeof item.capability === "string" && item.capability.trim() ? item.capability.trim() : inferCapability(task),
      district: typeof item.district === "string" ? item.district as DistrictId : undefined,
      dep: dep?.length ? dep : index > 0 ? [index] : undefined,
      estimatedCostXlm: Math.max(0.001, Number(item.estimatedCostXlm ?? DEFAULT_STEP_COST_XLM)),
    }
  }).filter((task): task is PlannedTask => task !== null)
  return tasks.length > 0 ? tasks : null
}

export async function planWorkflow(input: { goal: unknown; budget?: unknown; deadline?: unknown; apiKey?: string }): Promise<{ goal: string; budget: Required<OrchestrationBudget>; deadline?: string; plan: PlannedTask[]; planner: "claude-haiku" | "fallback" }> {
  const goal = normalizeGoal(input.goal)
  const budget = normalizeBudget(input.budget)
  const deadline = normalizeDeadline(input.deadline)

  if (!input.apiKey) {
    return { goal, budget, deadline, plan: fallbackPlan(goal, budget.maxTasks), planner: "fallback" }
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": input.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 900,
        system: "Decompose goals into a JSON DAG for Open Stellar agents. Return only JSON with plan: [{task, capability, district, dep, estimatedCostXlm}].",
        messages: [{ role: "user", content: JSON.stringify({ goal, budget, deadline }) }],
      }),
    })
    if (response.ok) {
      const data = await response.json() as { content?: Array<{ text?: string }> }
      const text = data.content?.map((part) => part.text).filter(Boolean).join("\n") ?? ""
      const parsed = parsePlannerResponse(JSON.parse(text), budget.maxTasks)
      if (parsed) return { goal, budget, deadline, plan: parsed, planner: "claude-haiku" }
    }
  } catch {
    // Fall back to deterministic planning when the LLM is unavailable or returns invalid JSON.
  }

  return { goal, budget, deadline, plan: fallbackPlan(goal, budget.maxTasks), planner: "fallback" }
}
