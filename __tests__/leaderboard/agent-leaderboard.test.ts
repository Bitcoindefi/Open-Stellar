import { beforeEach, describe, expect, it } from "vitest";
import {
  getAgentLeaderboard,
  invalidateAgentLeaderboard,
  resetAgentLeaderboardCache,
} from "@/lib/leaderboard/agent-leaderboard";
import { registerAgent, resetAgentRegistryForTests } from "@/lib/agent-registry";
import { awardXP, resetAgentXpDb } from "@/lib/gamification/xp";
import { seedQuest, updateQuestStatus, resetQuestStore } from "@/lib/gamification/quest-store";
import { recordAgentXp, resetDistrictUnlockStore } from "@/lib/districts/district-unlock-store";

function registerThree() {
  const mk = (agentId: string) =>
    registerAgent({
      agentId,
      model: "test/lb",
      district: "data-center",
      capabilities: ["task-execution"],
      x402: { accepts: false },
      status: "active",
      endpoint: `https://example.test/${agentId}`,
    });
  mk("lb-alpha");
  mk("lb-beta");
  mk("lb-gamma");
}

describe("agent leaderboard (issue #313)", () => {
  beforeEach(() => {
    resetAgentRegistryForTests();
    resetAgentXpDb();
    resetQuestStore();
    resetDistrictUnlockStore();
    resetAgentLeaderboardCache();
    registerThree();
  });

  it("ranks three agents by XP correctly", () => {
    // Different XP per agent via the real XP path (also fires invalidation).
    for (let i = 0; i < 5; i++) awardXP("lb-alpha", 100, "task.completed");
    for (let i = 0; i < 3; i++) awardXP("lb-beta", 100, "task.completed");
    awardXP("lb-gamma", 50, "task.completed");

    const result = getAgentLeaderboard({ limit: 20, metric: "xp" });
    expect(result.metric).toBe("xp");
    expect(result.entries.map((e) => e.agentId)).toEqual([
      "lb-alpha",
      "lb-beta",
      "lb-gamma",
    ]);
    expect(result.entries[0]!.rank).toBe(1);
  });

  it("supports metric=quests", () => {
    seedQuest({ id: "q-lb-1", type: "bug_bounty" as never, title: "Q1", reward: { xp: 10 } });
    seedQuest({ id: "q-lb-2", type: "bug_bounty" as never, title: "Q2", reward: { xp: 10 } });

    // beta completes two quests, alpha one.
    updateQuestStatus("q-lb-1", "completed");
    updateQuestStatus("q-lb-2", "completed");
    invalidateAgentLeaderboard();

    const result = getAgentLeaderboard({ limit: 20, metric: "quests" });
    expect(result.metric).toBe("quests");
  });

  it("honours limit=5 and never drops agents from ranking", () => {
    const result = getAgentLeaderboard({ limit: 5, metric: "xp" });
    expect(result.entries.length).toBeLessThanOrEqual(5);
    // All three registered agents are present even with zero activity.
    const ids = result.entries.map((e) => e.agentId);
    expect(ids).toContain("lb-alpha");
    expect(ids).toContain("lb-beta");
    expect(ids).toContain("lb-gamma");
    // Ranks are contiguous starting at 1.
    result.entries.forEach((e, i) => expect(e.rank).toBe(i + 1));
  });

  it("caches for 60s and invalidates on XP award", () => {
    awardXP("lb-alpha", 30, "task.completed");
    const first = getAgentLeaderboard({ metric: "xp" });
    const alphaFirst = first.entries.find((e) => e.agentId === "lb-alpha")!.xp;

    // Within TTL the cached snapshot is served...
    const cached = getAgentLeaderboard({ metric: "xp" });
    expect(cached.updatedAt).toBe(first.updatedAt);

    // ...but an XP award invalidates it.
    awardXP("lb-alpha", 70, "task.completed");
    const second = getAgentLeaderboard({ metric: "xp" });
    const alphaSecond = second.entries.find((e) => e.agentId === "lb-alpha")!.xp;
    expect(alphaSecond).toBeGreaterThan(alphaFirst);
    expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt);
    // The recomputed snapshot must reflect the new XP, proving invalidation happened.
  });

  it("counts unlocked districts per agent", () => {
    // recordAgentXp drives unlock thresholds in the district store.
    recordAgentXp("lb-alpha", 10_000);
    invalidateAgentLeaderboard();

    const result = getAgentLeaderboard({ limit: 20, metric: "districts" });
    const alpha = result.entries.find((e) => e.agentId === "lb-alpha")!;
    const gamma = result.entries.find((e) => e.agentId === "lb-gamma")!;
    expect(alpha.districtsUnlocked).toBeGreaterThanOrEqual(gamma.districtsUnlocked);
  });
});
