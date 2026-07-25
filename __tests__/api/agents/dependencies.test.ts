import { beforeEach, describe, expect, it } from "vitest"

import { GET as getDependencies } from "@/app/api/agents/[id]/dependencies/route"
import { GET as getDependents } from "@/app/api/agents/[id]/dependents/route"
import { registerAgent, resetAgentRegistryForTests } from "@/lib/agent-registry"

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

function manifest(agentId: string, dependencies?: string[]) {
  return {
    agentId,
    model: "claude-haiku-4-5",
    district: "data-center",
    capabilities: ["task-routing"],
    x402: { accepts: false },
    status: "active",
    endpoint: `https://example.com/agents/${agentId}`,
    ...(dependencies === undefined ? {} : { dependencies }),
  }
}

function registerDiamond() {
  registerAgent(manifest("agent-d"))
  registerAgent(manifest("agent-b", ["agent-d"]))
  registerAgent(manifest("agent-c", ["agent-d"]))
  registerAgent(manifest("agent-a", ["agent-b", "agent-c"]))
}

beforeEach(() => {
  resetAgentRegistryForTests()
})

describe("agent dependency graph API", () => {
  it("returns an empty dependency tree for an agent with no dependencies", async () => {
    const agent = registerAgent(manifest("agent-a"))

    const response = await getDependencies(
      new Request("http://localhost/api/agents/agent-a/dependencies"),
      context("agent-a"),
    )

    expect(agent.dependencies).toBeUndefined()
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.json()).toEqual({
      agentId: "agent-a",
      dependencies: [],
      totalCount: 0,
      maxDepth: 0,
    })
  })

  it("returns a single direct dependency", async () => {
    registerAgent(manifest("agent-b"))
    registerAgent(manifest("agent-a", ["agent-b"]))

    const response = await getDependencies(
      new Request("http://localhost/api/agents/agent-a/dependencies"),
      context("agent-a"),
    )

    expect(await response.json()).toEqual({
      agentId: "agent-a",
      dependencies: [
        { agentId: "agent-b", depth: 1, dependencies: [] },
      ],
      totalCount: 1,
      maxDepth: 1,
    })
  })

  it("returns a three-agent dependency chain", async () => {
    registerAgent(manifest("agent-c"))
    registerAgent(manifest("agent-b", ["agent-c"]))
    registerAgent(manifest("agent-a", ["agent-b"]))

    const response = await getDependencies(
      new Request("http://localhost/api/agents/agent-a/dependencies"),
      context("agent-a"),
    )

    expect(await response.json()).toEqual({
      agentId: "agent-a",
      dependencies: [
        {
          agentId: "agent-b",
          depth: 1,
          dependencies: [
            { agentId: "agent-c", depth: 2, dependencies: [] },
          ],
        },
      ],
      totalCount: 2,
      maxDepth: 2,
    })
  })

  it("preserves a shared dependency in both branches of a diamond", async () => {
    registerDiamond()

    const response = await getDependencies(
      new Request("http://localhost/api/agents/agent-a/dependencies"),
      context("agent-a"),
    )

    expect(await response.json()).toEqual({
      agentId: "agent-a",
      dependencies: [
        {
          agentId: "agent-b",
          depth: 1,
          dependencies: [
            { agentId: "agent-d", depth: 2, dependencies: [] },
          ],
        },
        {
          agentId: "agent-c",
          depth: 1,
          dependencies: [
            { agentId: "agent-d", depth: 2, dependencies: [] },
          ],
        },
      ],
      totalCount: 4,
      maxDepth: 2,
    })
  })

  it("returns the inverse dependent tree", async () => {
    registerDiamond()

    const response = await getDependents(
      new Request("http://localhost/api/agents/agent-d/dependents"),
      context("agent-d"),
    )

    expect(await response.json()).toEqual({
      agentId: "agent-d",
      dependents: [
        {
          agentId: "agent-b",
          depth: 1,
          dependents: [
            { agentId: "agent-a", depth: 2, dependents: [] },
          ],
        },
        {
          agentId: "agent-c",
          depth: 1,
          dependents: [
            { agentId: "agent-a", depth: 2, dependents: [] },
          ],
        },
      ],
      totalCount: 4,
      maxDepth: 2,
    })
  })

  it("returns unique flat dependency and dependent lists in breadth-first order", async () => {
    registerDiamond()

    const dependenciesResponse = await getDependencies(
      new Request("http://localhost/api/agents/agent-a/dependencies?flat=true"),
      context("agent-a"),
    )
    const dependentsResponse = await getDependents(
      new Request("http://localhost/api/agents/agent-d/dependents?flat=true"),
      context("agent-d"),
    )

    expect(dependenciesResponse.headers.get("Cache-Control")).toBe("no-store")
    expect(dependentsResponse.headers.get("Cache-Control")).toBe("no-store")
    expect(await dependenciesResponse.json()).toEqual({
      agentId: "agent-a",
      dependencies: ["agent-b", "agent-c", "agent-d"],
    })
    expect(await dependentsResponse.json()).toEqual({
      agentId: "agent-d",
      dependents: ["agent-b", "agent-c", "agent-a"],
    })
  })

  it("limits traversal to maxDepth", async () => {
    registerDiamond()

    const response = await getDependencies(
      new Request("http://localhost/api/agents/agent-a/dependencies?maxDepth=1"),
      context("agent-a"),
    )

    expect(await response.json()).toEqual({
      agentId: "agent-a",
      dependencies: [
        { agentId: "agent-b", depth: 1, dependencies: [] },
        { agentId: "agent-c", depth: 1, dependencies: [] },
      ],
      totalCount: 2,
      maxDepth: 1,
    })
  })

  it("returns an empty traversal when maxDepth is zero", async () => {
    registerAgent(manifest("agent-b"))
    registerAgent(manifest("agent-a", ["agent-b"]))

    const response = await getDependencies(
      new Request("http://localhost/api/agents/agent-a/dependencies?maxDepth=0"),
      context("agent-a"),
    )

    expect(await response.json()).toEqual({
      agentId: "agent-a",
      dependencies: [],
      totalCount: 0,
      maxDepth: 0,
    })
  })

  it.each(["invalid", "-1"])(
    "defaults malformed maxDepth=%s safely to ten",
    async (maxDepth) => {
      registerAgent(manifest("agent-c"))
      registerAgent(manifest("agent-b", ["agent-c"]))
      registerAgent(manifest("agent-a", ["agent-b"]))

      const response = await getDependencies(
        new Request(`http://localhost/api/agents/agent-a/dependencies?flat=true&maxDepth=${maxDepth}`),
        context("agent-a"),
      )

      expect(await response.json()).toEqual({
        agentId: "agent-a",
        dependencies: ["agent-b", "agent-c"],
      })
    },
  )

  it("rejects maxDepth values above ten", async () => {
    registerAgent(manifest("agent-a"))

    const response = await getDependencies(
      new Request("http://localhost/api/agents/agent-a/dependencies?maxDepth=11"),
      context("agent-a"),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "max_depth_exceeded" })
  })

  it("returns 404 for an unknown root agent", async () => {
    const response = await getDependents(
      new Request("http://localhost/api/agents/missing/dependents"),
      context("missing"),
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      ok: false,
      error: "agent not found",
    })
  })
})

describe("agent dependency registration", () => {
  it("normalizes duplicate dependencies", () => {
    registerAgent(manifest("agent-b"))

    const agent = registerAgent(manifest("agent-a", ["agent-b", " agent-b "]))

    expect(agent.dependencies).toEqual(["agent-b"])
  })

  it("rejects an unknown dependency", () => {
    expect(() => registerAgent(manifest("agent-a", ["missing"])))
      .toThrow("dependency agent not found: missing")
  })

  it("rejects a self-dependency", () => {
    expect(() => registerAgent(manifest("agent-a", ["agent-a"])))
      .toThrow("agent cannot depend on itself")
  })

  it("rejects a cycle when an existing agent is re-registered", () => {
    registerAgent(manifest("agent-a"))
    registerAgent(manifest("agent-b", ["agent-a"]))

    expect(() => registerAgent(manifest("agent-a", ["agent-b"])))
      .toThrow("agent dependencies cannot contain a cycle")
  })
})
