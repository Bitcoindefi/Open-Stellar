/**
 * Unified agent leaderboard (issue #313).
 *
 * Ranks ALL registered agents by one of three metrics:
 *   - xp        : current XP from the XP store (gamification/xp)
 *   - quests    : completed quest count (gamification/quest-store)
 *   - districts : unlocked district count (districts/district-unlock-store)
 *
 * Cached for 60 s in-process (same TTL pattern as other stores); the cache is
 * invalidated whenever a quest completes or XP is awarded, so rankings never
 * go stale after an activity event.
 */

import { listRegisteredAgents } from "@/lib/agent-registry";
import { getAgentXP } from "@/lib/gamification/xp";
import { getDistrictUnlockMap } from "@/lib/districts/district-unlock-store";
import { listStoredQuests } from "@/lib/gamification/quest-store";

export type AgentLeaderboardMetric = "xp" | "quests" | "districts";

export interface AgentLeaderboardEntry {
  rank: number;
  agentId: string;
  xp: number;
  questsCompleted: number;
  districtsUnlocked: number;
}

export interface AgentLeaderboardResult {
  metric: AgentLeaderboardMetric;
  updatedAt: number;
  entries: AgentLeaderboardEntry[];
}

const CACHE_TTL_MS = 60_000;

interface CacheSlot {
  computedAt: number;
  /** Per-agent raw stats, metric-independent. */
  stats: Map<string, { xp: number; questsCompleted: number; districtsUnlocked: number }>;
}

let cache: CacheSlot | null = null;
let cacheHits = 0;
let cacheMisses = 0;

/** Test hook: drop the cached snapshot and counters. */
export function resetAgentLeaderboardCache(): void {
  cache = null;
  cacheHits = 0;
  cacheMisses = 0;
}

export function agentLeaderboardCacheStats(): { hits: number; misses: number; ageMs: number | null } {
  return {
    hits: cacheHits,
    misses: cacheMisses,
    ageMs: cache ? Date.now() - cache.computedAt : null,
  };
}

/** Called from quest completion paths so the next read recomputes. */
export function invalidateAgentLeaderboard(): void {
  cache = null;
}

function computeStats(): CacheSlot["stats"] {
  const agents = listRegisteredAgents();
  const stats = new Map<string, { xp: number; questsCompleted: number; districtsUnlocked: number }>();

  for (const agent of agents) {
    const xpRecord = getAgentXP(agent.agentId);
    const map = getDistrictUnlockMap(agent.agentId);
    const districtsUnlocked = map.districts.filter((d) => d.status === "unlocked").length;
    stats.set(agent.agentId, {
      xp: xpRecord.xp,
      questsCompleted: questCompletionsFor(agent.agentId),
      districtsUnlocked,
    });
  }
  return stats;
}

function questCompletionsFor(agentId: string): number {
  let count = 0;
  for (const quest of listStoredQuests({ includeExpired: true })) {
    if (quest.status !== "completed") continue;
    const assignees = quest.assignedAgentIds ?? [];
    if (assignees.includes(agentId)) count += 1;
  }
  return count;
}

function ensureFresh(): CacheSlot {
  if (cache && Date.now() - cache.computedAt < CACHE_TTL_MS) {
    cacheHits += 1;
    return cache;
  }
  cacheMisses += 1;
  cache = { computedAt: Date.now(), stats: computeStats() };
  return cache;
}

/** Top agents ranked by the requested metric; inactive agents keep their rank at the bottom. */
export function getAgentLeaderboard(
  options: { limit?: number; metric?: AgentLeaderboardMetric } = {},
): AgentLeaderboardResult {
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const metric: AgentLeaderboardMetric = options.metric ?? "xp";

  const slot = ensureFresh();

  const entries: AgentLeaderboardEntry[] = Array.from(slot.stats.entries())
    .map(([agentId, s]) => ({
      rank: 0,
      agentId,
      xp: s.xp,
      questsCompleted: s.questsCompleted,
      districtsUnlocked: s.districtsUnlocked,
    }))
    .sort(
      (a, b) =>
        (metric === "xp" ? b.xp - a.xp
          : metric === "quests" ? b.questsCompleted - a.questsCompleted
          : b.districtsUnlocked - a.districtsUnlocked) ||
        a.agentId.localeCompare(b.agentId),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return { metric, updatedAt: slot.computedAt, entries: entries.slice(0, limit) };
}
