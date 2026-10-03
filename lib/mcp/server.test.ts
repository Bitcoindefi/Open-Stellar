import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { authenticateAccessToken, type AuthenticatedGrant } from "@/lib/mcp/oauth"
import { createAgenticCityMcpServer, type McpToolDeps } from "@/lib/mcp/server"
import type { PaidFetch } from "@/lib/orchestration/wallet"
import { createMemoryStore } from "@/lib/security/kv-store"
import { IdentityError } from "@/lib/solana/agent-identity"
import { fakeWalletRpc } from "@/__tests__/helpers/fake-wallet-rpc"
import { ORIGIN, connectGrant } from "@/__tests__/helpers/mcp"

type ToolText = { content: Array<{ type: string; text: string }>; isError?: boolean }

describe("Agentic City MCP tools", () => {
  const env = { ...process.env }
  let deps: McpToolDeps
  let auth: AuthenticatedGrant
  let paidFetch: ReturnType<typeof vi.fn<PaidFetch>>

  async function connect(scope?: string): Promise<Client> {
    const store = createMemoryStore()
    const { tokens, wallet } = await connectGrant(store, { scope })
    const result = await authenticateAccessToken(store, tokens.access_token, ORIGIN)
    if (!result.ok) throw new Error("auth")
    auth = result.value
    paidFetch = vi.fn<PaidFetch>(async () => new Response(JSON.stringify({ ok: true, result: "hecho", receipt: { transaction: "sig123" } })))
    deps = {
      store,
      origin: ORIGIN,
      baseUrl: ORIGIN,
      caps: { perRunMicro: 30_000, perDayMicro: 500_000, hardDayMicro: 2_000_000 },
      priceMicro: 10_000,
      rpc: (await fakeWalletRpc({ balances: { [wallet.address]: BigInt(30_000) } })).rpc,
      paidFetchFor: () => paidFetch,
      hostedReady: true,
      ownerTag: null,
      reputation: vi.fn(async (agentId: string) => ({ agentId, asset: "Asset1", registered: true, explorerUrl: "https://explorer/asset", reputation: { averageScore: 90, totalFeedbacks: 2 } })),
    }
    const server = createAgenticCityMcpServer(deps, auth)
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await server.connect(serverSide)
    const client = new Client({ name: "test", version: "1.0.0" })
    await client.connect(clientSide)
    return client
  }

  async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<ToolText> {
    return await client.callTool({ name, arguments: args }) as ToolText
  }

  beforeEach(() => {
    delete process.env.CONNECTIONS_SECRET
    process.env.BETTER_AUTH_SECRET = "mcp-server-secret"
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    process.env = { ...env }
    vi.restoreAllMocks()
  })

  it("lists the four tools with instructions", async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual(["get_agent_reputation", "hire_agent", "list_agents", "wallet_status"])
    expect(client.getInstructions()).toContain("x402")
  })

  it("list_agents returns the default roster when no team was shared", async () => {
    const client = await connect()
    const result = await call(client, "list_agents")
    const data = JSON.parse(result.content[0].text)
    expect(data.agents.map((agent: { id: string }) => agent.id)).toEqual(["researcher", "analyst", "writer"])
    expect(data.pricePerHireUsdc).toBe("0.01")
    expect(data.paidFrom).toBe(auth.grant.address)
  })

  it("hire_agent returns the answer and the receipt", async () => {
    const client = await connect()
    const result = await call(client, "hire_agent", { agentId: "writer", task: "Escribí un haiku" })
    expect(result.isError).toBeFalsy()
    expect(result.content[0].text).toContain("hecho")
    expect(result.content[0].text).toContain('"tx":"sig123"')
    expect(result.content[0].text).toContain("explorer.solana.com/tx/sig123")
  })

  it("hire_agent errors are readable text, and an unexpected failure says nothing was paid", async () => {
    const client = await connect()
    const refused = await call(client, "hire_agent", { agentId: "ghost", task: "x" })
    expect(refused.isError).toBe(true)
    expect(refused.content[0].text).toContain("There is no agent")

    paidFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "model failed", receipt: { transaction: "sig9" } }), { status: 502 }))
    const paidButFailed = await call(client, "hire_agent", { agentId: "writer", task: "y" })
    expect(paidButFailed.isError).toBe(true)
    expect(paidButFailed.content[0].text).toContain("sig9")

    deps.paidFetchFor = () => { throw new Error("boom with internals") }
    const crashed = await call(client, "hire_agent", { agentId: "writer", task: "z" })
    expect(crashed.isError).toBe(true)
    expect(crashed.content[0].text).toContain("nothing was paid")
    expect(crashed.content[0].text).not.toContain("boom")
  })

  it("get_agent_reputation reads the 8004 registry for the browser's agent", async () => {
    const client = await connect()
    const result = await call(client, "get_agent_reputation", { agentId: "RESEARCHER" })
    expect(JSON.parse(result.content[0].text)).toMatchObject({ agentId: "researcher", name: "Investigadora", registered: true, reputation: { averageScore: 90 } })
    expect(deps.reputation).toHaveBeenCalledWith("researcher", null)

    vi.mocked(deps.reputation).mockResolvedValueOnce({ agentId: "x", asset: "A", registered: false, explorerUrl: "e", reputation: null })
    expect(JSON.parse((await call(client, "get_agent_reputation", { agentId: "x" })).content[0].text).note).toContain("Not registered")

    vi.mocked(deps.reputation).mockRejectedValueOnce(new IdentityError("Agent identity is not configured on this server.", 503))
    expect((await call(client, "get_agent_reputation", { agentId: "x" })).content[0].text).toContain("not configured")
    vi.mocked(deps.reputation).mockRejectedValueOnce(new Error("rpc 500"))
    const failed = await call(client, "get_agent_reputation", { agentId: "x" })
    expect(failed.isError).toBe(true)
    expect(failed.content[0].text).toContain("could not be read")
  })

  it("wallet_status shows balance, spend and caps", async () => {
    const client = await connect()
    const data = JSON.parse((await call(client, "wallet_status")).content[0].text)
    expect(data).toMatchObject({ address: auth.grant.address, balanceUsdc: "0.03", caps: { thisClientPerDayUsdc: "0.1" } })
  })

  it("a read-only connection can look but not hire", async () => {
    const client = await connect("agents:read")
    expect((await call(client, "list_agents")).isError).toBeFalsy()
    const hire = await call(client, "hire_agent", { agentId: "writer", task: "x" })
    expect(hire.isError).toBe(true)
    expect(hire.content[0].text).toContain("agents:hire")
  })

  it("a hire-only connection cannot read reputation or the wallet", async () => {
    const client = await connect("agents:hire")
    expect((await call(client, "wallet_status")).isError).toBe(true)
    expect((await call(client, "get_agent_reputation", { agentId: "writer" })).isError).toBe(true)
    expect((await call(client, "list_agents")).isError).toBeFalsy()
  })
})
