import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAgentXPFromFile,
  getAgentXPHistory,
  resetAgentXpStore,
  saveAgentXPRecord,
  seedAgentXPSnapshots,
  simulateColdStart,
} from "@/lib/gamification/xp-store";

describe("xp-store (file persistence, issue #191)", () => {
  beforeEach(() => {
    resetAgentXpStore();
  });

  it("persists XP across a simulated server restart", () => {
    saveAgentXPRecord({ agentId: "restart-agent", xp: 120, level: 2 });

    // Simulate a cold start: drop the in-process cache; the store reloads from disk.
    simulateColdStart();

    expect(getAgentXPFromFile("restart-agent")).toMatchObject({
      agentId: "restart-agent",
      xp: 120,
      level: 2,
    });
  });

  it("returns zeroed record for unknown agents", () => {
    expect(getAgentXPFromFile("ghost-agent")).toEqual({
      agentId: "ghost-agent",
      xp: 0,
      level: 1,
    });
  });

  it("keeps history capped so the file cannot grow without bound", () => {
    const agentId = "history-agent";
    const gains = Array.from({ length: 95 }, (_, day) => day + 1);
    seedAgentXPSnapshots(agentId, gains, 0);
    const history = getAgentXPHistory(agentId);
    expect(history.length).toBeLessThanOrEqual(90);
  });

  it("seeds at least 7 chart data points on demand", () => {
    const agentId = "chart-agent";
    seedAgentXPSnapshots(agentId, [5, 8, 3, 10, 6, 9, 4, 7], 20);
    const history = getAgentXPHistory(agentId);
    expect(history.length).toBeGreaterThanOrEqual(7);
    expect(history[0]!.agentId).toBe(agentId);
  });
});
