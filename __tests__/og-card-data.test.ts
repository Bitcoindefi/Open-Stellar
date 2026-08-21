import { describe, expect, it } from "vitest";
import { DISTRICTS, createAgents } from "@/lib/data";
import {
  findAgentByLookup,
  findDistrictByLookup,
  formatAgentShareText,
  getAgentCardStats,
  getAgentOgPath,
  getAgentProfilePath,
  slugifyAgent,
} from "@/lib/og-card-data";
import {
  registerAgent,
  resetAgentRegistryForTests,
} from "@/lib/agent-registry";

describe("OG card data helpers", () => {
  it("resolves agents by id, name, and share slug", () => {
    const [agent] = createAgents();
    const slug = slugifyAgent(agent);

    expect(findAgentByLookup(agent.id)?.id).toBe(agent.id);
    expect(findAgentByLookup(agent.name)?.id).toBe(agent.id);
    expect(findAgentByLookup(slug)?.id).toBe(agent.id);
  });

  it("builds stable profile and OG paths from the agent slug", () => {
    const [agent] = createAgents();
    const slug = slugifyAgent(agent);

    expect(getAgentProfilePath(agent)).toBe(`/agents/${slug}`);
    expect(getAgentOgPath(agent)).toBe(`/api/og/agent/${slug}`);
  });

  it("derives display stats and share copy from existing agent data", () => {
    const [agent] = createAgents();
    const stats = getAgentCardStats(agent);
    const shareText = formatAgentShareText(agent);

    expect(stats.level).toBeGreaterThan(0);
    expect(Number(stats.earnedXlm)).toBeGreaterThan(0);
    expect(Number(stats.uptime)).toBeGreaterThanOrEqual(96.5);
    expect(shareText).toContain(agent.name);
    expect(shareText).toContain("tasks completed");
  });

  it("resolves district ids and display names", () => {
    const [district] = DISTRICTS;

    expect(findDistrictByLookup(district.id)?.id).toBe(district.id);
    expect(findDistrictByLookup(district.name)?.id).toBe(district.id);
  });

  it("resolves dynamic registered agents when not pre-seeded", () => {
    resetAgentRegistryForTests();

    registerAgent({
      agentId: "dynamic-bot-99",
      model: "claude-3.5-haiku",
      district: "defense",
      capabilities: ["Encryption", "Perimeter Guard"],
      status: "active",
      endpoint: "http://localhost:8080/api",
      x402: { accepts: true, pricePerTask: "0.01" },
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const found = findAgentByLookup("dynamic-bot-99");
    expect(found).not.toBeNull();
    expect(found?.id).toBe("dynamic-bot-99");
    expect(found?.model).toBe("claude-3.5-haiku");
    expect(found?.district).toBe("defense");
    expect(found?.status).toBe("active");
  });
});
