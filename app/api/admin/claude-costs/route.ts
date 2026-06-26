import { createApiRouteLogger } from "@/lib/api-logging"
import { getAgentClaudeAnalytics, listClaudeCostRecords } from "@/lib/agent-runtime/costs"

export async function GET(req: Request) {
  const api = createApiRouteLogger(req, "/api/admin/claude-costs")
  const url = new URL(req.url)
  const agentId = url.searchParams.get("agentId") ?? undefined
  const budgetParam = url.searchParams.get("dailyBudgetUsd")
  const dailyBudgetUsd = budgetParam ? Number(budgetParam) : undefined
  const records = listClaudeCostRecords(agentId)

  return api.json(
    {
      ok: true,
      records,
      analytics: agentId ? getAgentClaudeAnalytics(agentId, dailyBudgetUsd) : null,
      alerts: agentId && getAgentClaudeAnalytics(agentId, dailyBudgetUsd).overDailyBudget
        ? [{ type: "daily_budget_exceeded", agentId, dailyBudgetUsd: dailyBudgetUsd ?? 5 }]
        : [],
    },
    undefined,
    { event: "claude.costs.list", agentId },
  )
}
