import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import AgentPage, { generateMetadata } from "@/app/agents/[id]/page";
import {
  registerAgent,
  resetAgentRegistryForTests,
} from "@/lib/agent-registry";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("404");
  }),
}));

describe("Agent Profile Page", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders 404 when agent does not exist", async () => {
    resetAgentRegistryForTests();
    await expect(
      AgentPage({ params: Promise.resolve({ id: "non-existent" }) }),
    ).rejects.toThrow("404");
  });

  it("renders dynamic agent page metadata and page element correctly", async () => {
    resetAgentRegistryForTests();
    registerAgent({
      agentId: "agent-007",
      model: "gpt-5-mini",
      district: "defense",
      capabilities: ["Threat Detection"],
      status: "active",
      endpoint: "http://localhost:8080",
      x402: { accepts: false },
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const element = await AgentPage({
      params: Promise.resolve({ id: "agent-007" }),
    });
    expect(element).toBeDefined();

    // Check metadata generation
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "agent-007" }),
    });
    expect(metadata.title).toContain("agent-007");
    expect(metadata.description).toContain("Defense Grid");
  });
});
