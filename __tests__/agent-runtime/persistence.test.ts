import { describe, expect, it } from "vitest";
import {
  loadPersistedState,
  savePersistedState,
  upsertPersistedAgent,
  removePersistedAgent,
} from "@/lib/agent-runtime/persistence";

describe("Agent State Persistence", () => {
  it("upserts and loads persisted agent state to survive restarts", () => {
    const testId = "bot-unique-persistence-test";
    upsertPersistedAgent({
      id: testId,
      name: "PersistenceAgent",
      model: "claude-4-sonnet",
      district: "data-center",
      status: "active",
      cpu: 20,
      memory: 45,
      autoRestart: true,
      updatedAt: new Date().toISOString(),
    });

    const state = loadPersistedState();
    const agent = state.agents.find((a) => a.id === testId);

    expect(agent).toBeDefined();
    expect(agent?.name).toBe("PersistenceAgent");
    expect(agent?.district).toBe("data-center");
    expect(agent?.status).toBe("active");

    removePersistedAgent(testId);
    const updated = loadPersistedState();
    expect(updated.agents.find((a) => a.id === testId)).toBeUndefined();
  });
});
