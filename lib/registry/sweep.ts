/**
 * Registry staleness rules (issue #193).
 *
 * This file is the single source of truth for heartbeat thresholds and the
 * sweep algorithm. Nothing else may hardcode these numbers.
 *
 * Contract for agents:
 *   POST /api/registry/[id]/heartbeat every HEARTBEAT_INTERVAL_MS.
 *   - lastSeen older than OFFLINE_THRESHOLD_MS  -> agent is reported "offline"
 *     (kept in the registry so its history survives a brief outage)
 *   - lastSeen older than STALE_REMOVE_MS       -> agent is removed entirely
 */

/** How often an agent must send a heartbeat. */
export const HEARTBEAT_INTERVAL_MS = 60_000;

/** Missing this many intervals marks the agent offline (>2 missed beats). */
export const OFFLINE_THRESHOLD_MS = 120_000;

/** Unseen for longer than this, the agent is removed from the registry. */
export const STALE_REMOVE_MS = 600_000;

export interface SweepResult {
  /** Agents marked offline during this run. */
  markedOffline: string[];
  /** Agents fully removed from the registry during this run. */
  removed: string[];
}

type Clock = () => number;

let nowFn: Clock = () => Date.now();

/** Test hook: inject a deterministic clock. */
export function setSweepClock(fn: Clock): void {
  nowFn = fn;
}

export function resetSweepClock(): void {
  nowFn = () => Date.now();
}

export function sweepNow(): number {
  return nowFn();
}

interface AgentLike {
  agentId: string;
  lastSeenAt?: number;
}

/**
 * Run one sweep pass over `agents`.
 *
 * Concurrency-safe: each decision callback fires exactly once per pass, and
 * removal goes through the registry's idempotent delete, so two simultaneous
 * sweeps cannot double-count `stale_removed_last_run`.
 */
export function computeSweep(
  agents: readonly AgentLike[],
  applyOffline: (agentId: string) => void,
  applyRemove: (agentId: string) => void,
): SweepResult {
  const now = sweepNow();
  const result: SweepResult = { markedOffline: [], removed: [] };

  for (const agent of agents) {
    const lastSeenAt = agent.lastSeenAt;
    if (lastSeenAt === undefined) continue;

    const unseenFor = now - lastSeenAt;

    if (unseenFor > STALE_REMOVE_MS) {
      applyRemove(agent.agentId);
      result.removed.push(agent.agentId);
    } else if (unseenFor > OFFLINE_THRESHOLD_MS) {
      applyOffline(agent.agentId);
      result.markedOffline.push(agent.agentId);
    }
  }

  return result;
}
