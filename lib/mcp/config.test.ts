import { describe, expect, it } from "vitest"
import { authorizationServerMetadata, clampGrantCap, defaultGrantCapMicro, parseScopes, protectedResourceMetadata, publicOrigin } from "@/lib/mcp/config"
import { DEFAULT_ROSTER, findAgent, hostedConnection, normalizeTeam, rosterFor } from "@/lib/mcp/roster"

describe("MCP config", () => {
  it("defaults the client cap to 0.1 USDC/day, never above the browser cap", () => {
    expect(defaultGrantCapMicro({})).toBe(100_000)
    expect(defaultGrantCapMicro({ MCP_GRANT_MAX_USDC_PER_DAY: "0.3" })).toBe(300_000)
    expect(defaultGrantCapMicro({ MCP_GRANT_MAX_USDC_PER_DAY: "5" })).toBe(500_000)
    expect(defaultGrantCapMicro({ MCP_GRANT_MAX_USDC_PER_DAY: "nope" })).toBe(100_000)
    expect(defaultGrantCapMicro({ ORCHESTRATOR_MAX_USDC_PER_DAY: "0.05" })).toBe(50_000)
  })

  it("clamps a chosen cap to the browser cap", () => {
    expect(clampGrantCap("0.2", {})).toBe(200_000)
    expect(clampGrantCap("9", {})).toBe(500_000)
    expect(clampGrantCap("0", {})).toBe(100_000)
    expect(clampGrantCap(undefined, {})).toBe(100_000)
    expect(clampGrantCap("-1", {})).toBe(100_000)
  })

  it("parses scopes", () => {
    expect(parseScopes(null)).toEqual(["agents:read", "agents:hire"])
    expect(parseScopes("agents:hire agents:read")).toEqual(["agents:read", "agents:hire"])
    expect(parseScopes("agents:hire")).toEqual(["agents:hire"])
    expect(parseScopes("openid")).toBeNull()
  })

  it("uses the configured public origin when valid", () => {
    expect(publicOrigin("http://localhost:3919/api/mcp", {})).toBe("http://localhost:3919")
    expect(publicOrigin("http://internal/api/mcp", { MCP_PUBLIC_ORIGIN: "https://agentic-city.vercel.app" })).toBe("https://agentic-city.vercel.app")
    expect(publicOrigin("http://internal/api/mcp", { MCP_PUBLIC_ORIGIN: "https://x.example/path" })).toBe("http://internal")
    expect(protectedResourceMetadata("https://a.test").resource).toBe("https://a.test/api/mcp")
    expect(authorizationServerMetadata("https://a.test").grant_types_supported).toEqual(["authorization_code", "refresh_token"])
  })
})

describe("MCP roster", () => {
  it("keeps only ids, names and roles of a team snapshot", () => {
    const team = normalizeTeam([
      { id: "worker-1", name: "Researcher\n", role: "Research", connection: { apiKey: "secret" } },
      { id: "worker-1", name: "Duplicate", role: "x" },
      { id: "bad id!", name: "Bad" },
      null,
      "nope",
      { id: "w2", name: "", role: "" },
    ])
    expect(team).toEqual([
      { id: "worker-1", name: "Researcher", role: "Research" },
      { id: "w2", name: "w2", role: "General assistant" },
    ])
    expect(JSON.stringify(team)).not.toContain("secret")
    expect(normalizeTeam("x")).toEqual([])
    expect(normalizeTeam(Array.from({ length: 9 }, (_, i) => ({ id: `a${i}`, name: `A${i}` })))).toHaveLength(5)
  })

  it("falls back to the default roster and finds agents by id or name", () => {
    expect(rosterFor([])).toBe(DEFAULT_ROSTER)
    expect(rosterFor(null)).toBe(DEFAULT_ROSTER)
    expect(findAgent(DEFAULT_ROSTER, "ANALYST")?.id).toBe("analyst")
    expect(findAgent(DEFAULT_ROSTER, "redactor")?.id).toBe("writer")
    expect(findAgent(DEFAULT_ROSTER, " ")).toBeNull()
    expect(findAgent(DEFAULT_ROSTER, "ghost")).toBeNull()
  })

  it("configures the hosted model from env, off without a key", () => {
    expect(hostedConnection({})).toBeNull()
    expect(hostedConnection({ AI_GATEWAY_API_KEY: "gw-key-12345" })).toEqual({ provider: "vercel-ai-gateway", model: "openai/gpt-4o-mini", apiKey: "gw-key-12345" })
    expect(hostedConnection({ MCP_AGENT_PROVIDER: "openrouter", MCP_AGENT_MODEL: "x/y", MCP_AGENT_API_KEY: "or-key-12345", AI_GATEWAY_API_KEY: "ignored-123" })).toEqual({ provider: "openrouter", model: "x/y", apiKey: "or-key-12345" })
    expect(hostedConnection({ MCP_AGENT_PROVIDER: "openrouter", AI_GATEWAY_API_KEY: "gw-key-12345" })).toBeNull()
    expect(hostedConnection({ MCP_AGENT_PROVIDER: "nope", MCP_AGENT_API_KEY: "k-12345678" })).toBeNull()
  })
})
