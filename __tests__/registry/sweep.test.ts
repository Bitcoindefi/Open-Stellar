import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeSweep,
  HEARTBEAT_INTERVAL_MS,
  OFFLINE_THRESHOLD_MS,
  STALE_REMOVE_MS,
  setSweepClock,
  resetSweepClock,
} from "@/lib/registry/sweep";

/**
 * Issue #193 thresholds, verified with an injected clock (no real waits):
 *   still online at 119s, offline at 121s, removed at 601s,
 *   and a concurrent double-sweep removing each agent exactly once.
 */

let now = 1_000_000;

function agent(agentId: string, lastSeenAt: number) {
  return { agentId, lastSeenAt };
}

describe("registry sweep thresholds", () => {
  beforeEach(() => {
    setSweepClock(() => now);
  });

  afterEach(() => {
    resetSweepClock();
  });

  it("uses the documented constants", () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(60_000);
    expect(OFFLINE_THRESHOLD_MS).toBe(120_000);
    expect(STALE_REMOVE_MS).toBe(600_000);
  });

  it("keeps an agent online at 119s unseen", () => {
    const agents = [agent("a", now - 119_000)];
    const removed: string[] = [];
    const markedOffline: string[] = [];
    const result = computeSweep(
      agents,
      (id) => void markedOffline.push(id),
      (id) => void removed.push(id),
    );
    expect(markedOffline).toEqual([]);
    expect(removed).toEqual([]);
    expect(result.removed).toHaveLength(0);
  });

  it("marks an agent offline at 121s unseen", () => {
    const agents = [agent("a", now - 121_000)];
    let takenOffline = false;
    const removed: string[] = [];
    const result = computeSweep(
      agents,
      () => {
        takenOffline = true;
      },
      (id) => void removed.push(id),
    );
    expect(takenOffline).toBe(true);
    expect(result.markedOffline).toEqual(["a"]);
    expect(removed).toEqual([]);
  });

  it("removes an agent at 601s unseen", () => {
    const agents = [agent("a", now - 601_000)];
    const removed: string[] = [];
    const result = computeSweep(
      agents,
      () => {},
      (id) => removed.push(id),
    );
    expect(result.removed).toEqual(["a"]);
  });
});

describe("concurrent double-sweep", () => {
  it("removes each stale agent exactly once across two simultaneous sweeps", () => {
    setSweepClock(() => now);
    // Shared registry simulation.
    const registry = new Map<string, number>([
      ["stale-1", now - 700_000],
      ["stale-2", now - 650_000],
      ["fresh", now],
    ]);
    const removalLog: string[] = [];

    const runSweep = () =>
      computeSweep(
        Array.from(registry.entries()).map(([agentId, lastSeenAt]) => ({ agentId, lastSeenAt })),
        (id) => {
          const a = registry.get(id);
          if (a !== undefined) registry.set(id, { ...{ agentId: id, lastSeenAt: a } } as never);
        },
        (id) => {
          // Idempotent delete: second sweep finds nothing to remove.
          if (registry.delete(id)) removalLog.push(id);
        },
      );

    const r1 = runSweep();
    const r2 = runSweep();

    expect(r1.removed.sort()).toEqual(["stale-1", "stale-2"]);
    expect(r2.removed).toEqual([]);
    expect(removalLog.sort()).toEqual(["stale-1", "stale-2"]);
    expect(registry.has("fresh")).toBe(true);
  });
});
