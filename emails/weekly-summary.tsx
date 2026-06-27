import * as React from "react"

export interface WeeklyAgentStat {
  agentName: string
  tasksCompleted: number
  xlmEarned: string
  usdEarned: string
}

export interface WeeklySummaryEmailProps {
  totalTasks: number
  totalXlmEarned: string
  totalUsdEarned: string
  topBadge?: string
  leaderboardPosition?: number
  agents: WeeklyAgentStat[]
  unsubscribeUrl: string
}

export function WeeklySummaryEmail({
  totalTasks,
  totalXlmEarned,
  totalUsdEarned,
  topBadge,
  leaderboardPosition,
  agents,
  unsubscribeUrl,
}: WeeklySummaryEmailProps) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", color: "#102033", lineHeight: 1.5 }}>
      <h1>Your Open Stellar week</h1>
      <p>{totalTasks.toLocaleString()} tasks completed, {totalXlmEarned} XLM earned ({totalUsdEarned}).</p>
      <p><strong>Top badge:</strong> {topBadge ?? "No badges unlocked this week"}</p>
      <p><strong>Leaderboard position:</strong> {leaderboardPosition ? `#${leaderboardPosition}` : "Not ranked yet"}</p>
      <h2>Per-agent stats</h2>
      <ul>
        {agents.map((agent) => (
          <li key={agent.agentName}>{agent.agentName}: {agent.tasksCompleted.toLocaleString()} tasks, {agent.xlmEarned} XLM ({agent.usdEarned})</li>
        ))}
      </ul>
      <p style={{ fontSize: 12, color: "#667085" }}>
        You are receiving this because weekly summaries are enabled. <a href={unsubscribeUrl}>Unsubscribe</a>.
      </p>
    </div>
  )
}
