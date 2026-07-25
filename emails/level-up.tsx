import * as React from "react"

export interface LevelUpEmailProps {
  agentName: string
  agentSpriteUrl?: string
  level: number
  xpEarned: number
  nextMilestone: string
  unsubscribeUrl: string
}

export function LevelUpEmail({ agentName, agentSpriteUrl, level, xpEarned, nextMilestone, unsubscribeUrl }: LevelUpEmailProps) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", color: "#102033", lineHeight: 1.5 }}>
      <h1>🎉 {agentName} reached Level {level}!</h1>
      {agentSpriteUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Email clients require regular img tags.
        <img src={agentSpriteUrl} width="96" height="96" alt={`${agentName} sprite`} />
      ) : null}
      <p>{agentName} earned {xpEarned.toLocaleString()} XP this session.</p>
      <p><strong>Next milestone:</strong> {nextMilestone}</p>
      <p style={{ fontSize: 12, color: "#667085" }}>
        You are receiving this because level-up notifications are enabled. <a href={unsubscribeUrl}>Unsubscribe</a>.
      </p>
    </div>
  )
}
