import { describe, expect, it } from "vitest"
import { createArcAgentWallet } from "@/lib/rails/arc/agent-wallet"
import { createArcChatRunDeps } from "@/lib/rails/arc/deps"
import type { ArcChain } from "@/lib/rails/arc/chain"
import type { PaidFetch } from "@/lib/orchestration/wallet"

const UID = "7".repeat(32)
const TX = `0x${"ab".repeat(32)}`
const agent = { id: "nexus", name: "Nexus-7", role: "Research", connection: { provider: "openai" as const, model: "gpt-test", apiKey: "sk-test-123456" } }

function chain(balance: bigint): ArcChain {
  return { usdcBalance: async () => balance, transferUsdc: async () => TX as `0x${string}`, waitForReceipt: async () => null }
}

describe("Arc chat run dependencies", () => {
  it("says Arc testnet and pays the task endpoint with ?network=arc", async () => {
    const wallet = createArcAgentWallet(UID)
    const urls: string[] = []
    const paidFetch: PaidFetch = async (input) => {
      urls.push(String(input))
      return Response.json({ ok: true, result: "answer", receipt: { transaction: TX, network: "eip155:5042002", payer: wallet.address, amount: "10000" } })
    }
    const deps = createArcChatRunDeps("https://agentic-city.test/api/connections/chat", { uid: UID, wallet }, {}, { chain: chain(BigInt(50_000)), paidFetchFor: () => paidFetch })
    expect(deps.network).toEqual({ caip2: "eip155:5042002", receiptNetwork: "arc-testnet", label: "Arc testnet" })
    expect(deps.wallet).toEqual({ address: wallet.address })
    const result = await deps.hire!(agent, "do it")
    expect(urls).toEqual(["https://agentic-city.test/api/x402/agents/nexus/task?network=arc"])
    expect(result).toMatchObject({ ok: true, receipt: { transaction: TX, explorerUrl: `https://explorer.testnet.arc.io/tx/${TX}` } })
  })

  it("does not pay from an Arc wallet that holds less than the price", async () => {
    const wallet = createArcAgentWallet(UID)
    let called = false
    const deps = createArcChatRunDeps("https://agentic-city.test/x", { uid: UID, wallet }, {}, { chain: chain(BigInt(5_000)), paidFetchFor: () => async () => { called = true; return new Response() } })
    expect(await deps.hire!(agent, "do it")).toMatchObject({ ok: false, code: "unfunded", balanceMicro: 5000 })
    expect(called).toBe(false)
  })

  it("cannot hire without a wallet", () => {
    expect(createArcChatRunDeps("https://agentic-city.test/x", { uid: "anonymous", wallet: null }, {}).hire).toBeNull()
  })
})
