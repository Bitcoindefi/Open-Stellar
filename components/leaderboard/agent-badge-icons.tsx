"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { LeaderboardBadge } from "@/lib/leaderboard"

const RARITY_COLOURS: Record<string, string> = {
  common: "#94a3b8",      // slate-400
  uncommon: "#4ade80",    // green-400
  rare: "#38bdf8",        // sky-400
  epic: "#c084fc",        // purple-400
  legendary: "#facc15",   // yellow-400
}

const RARITY_ICONS: Record<string, string> = {
  common: "⚙️",
  uncommon: "🌿",
  rare: "💠",
  epic: "🔮",
  legendary: "🌟",
}

const MAX_VISIBLE = 3

interface AgentBadgeIconsProps {
  badges: LeaderboardBadge[]
  /** When true, all badges are shown (used in the per-agent detail panel). */
  showAll?: boolean
}

/**
 * Renders up to 3 badge icons with tooltips (badge name + earned date).
 * When the agent has more than 3 badges a "+N more" chip is shown.
 * Pass `showAll` to display the full collection without a cap (detail page).
 * Mobile-safe: icons are small (20 px) and wrap gracefully.
 */
export function AgentBadgeIcons({ badges, showAll = false }: AgentBadgeIconsProps) {
  if (!badges || badges.length === 0) {
    return null
  }

  const visible = showAll ? badges : badges.slice(0, MAX_VISIBLE)
  const overflow = showAll ? 0 : badges.length - MAX_VISIBLE

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      aria-label={`${badges.length} badge${badges.length !== 1 ? "s" : ""}`}
    >
      {visible.map((badge) => {
        const colour = RARITY_COLOURS[badge.rarity] ?? RARITY_COLOURS.common
        const icon = RARITY_ICONS[badge.rarity] ?? "🏅"
        const dateLabel = new Date(badge.earnedAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })

        return (
          <Tooltip key={badge.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                style={{
                  borderColor: `${colour}55`,
                  backgroundColor: `${colour}18`,
                }}
                aria-label={`${badge.name}, earned ${dateLabel}`}
              >
                <span className="text-[13px] leading-none" aria-hidden="true">
                  {icon}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-[200px] bg-slate-900 text-slate-100 border border-slate-700"
            >
              <p className="font-semibold" style={{ color: colour }}>
                {badge.name}
              </p>
              <p className="mt-0.5 text-slate-400">Earned {dateLabel}</p>
            </TooltipContent>
          </Tooltip>
        )
      })}

      {overflow > 0 && (
        <span
          className="inline-flex h-6 items-center rounded-md border border-slate-700 bg-slate-800 px-1.5 font-mono text-[10px] text-slate-400"
          aria-label={`${overflow} more badge${overflow !== 1 ? "s" : ""}`}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
