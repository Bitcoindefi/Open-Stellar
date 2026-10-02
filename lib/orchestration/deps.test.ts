import { describe, expect, it, vi } from "vitest"
import { createKeyPairSignerFromPrivateKeyBytes } from "@solana/kit"
import { createAgentWallet } from "@/lib/agent-wallet/cookie"
import { createChatRunDeps, createWalletHire, hireBaseUrl } from "@/lib/orchestration/deps"
import type { HireAgent } from "@/lib/orchestration/wallet"
import { fakeWalletRpc } from "@/__tests__/helpers/fake-wallet-rpc"

const UID = "a".repeat(32)
const agent: HireAgent = { id: "research", name: "Investigador", role: "Relevar opciones", connection: { provider: "openrouter", model: "m", apiKey: "or-test-key-1234" } }

describe("hireBaseUrl", () => {
  it("uses the configured base URL, else the request origin", () => {
    expect(hireBaseUrl("https://agentic-city.vercel.app/api/connections/chat", {})).toBe("https://agentic-city.vercel.app")
    expect(hireBaseUrl("http://localhost:3000/api/connections/chat", { ORCHESTRATOR_X402_BASE_URL: "https://agentic-city.vercel.app/" })).toBe("https://agentic-city.vercel.app")
    expect(hireBaseUrl("http://localhost:3000/x", { ORCHESTRATOR_X402_BASE_URL: "javascript:alert(1)" })).toBe("http://localhost:3000")
  })
})

describe("createWalletHire", () => {
  it("pays the hire from the agents' wallet when it holds enough", async () => {
    const signer = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(4))
    const { rpc } = await fakeWalletRpc({ balances: { [signer.address]: BigInt(50_000) } })
    const paidFetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: "done", receipt: { transaction: "Sig1" } }), { status: 200 }))
    const hire = createWalletHire({ signer, rpc, paidFetch, baseUrl: "https://a.test", priceMicro: 10_000 })
    expect(await hire(agent, "Find options")).toMatchObject({ ok: true, answer: "done", receipt: { transaction: "Sig1" } })
    expect(paidFetch).toHaveBeenCalledWith("https://a.test/api/x402/agents/research/task", expect.objectContaining({ method: "POST" }))
  })

  it("reports an empty or short wallet without attempting the payment", async () => {
    const signer = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(5))
    const paidFetch = vi.fn()
    const empty = await fakeWalletRpc()
    expect(await createWalletHire({ signer, rpc: empty.rpc, paidFetch, baseUrl: "https://a.test", priceMicro: 10_000 })(agent, "x"))
      .toEqual({ ok: false, code: "unfunded", balanceMicro: 0, error: "the agents' wallet does not hold enough USDC" })
    const short = await fakeWalletRpc({ balances: { [signer.address]: BigInt(9_999) } })
    expect(await createWalletHire({ signer, rpc: short.rpc, paidFetch, baseUrl: "https://a.test", priceMicro: 10_000 })(agent, "x"))
      .toMatchObject({ ok: false, code: "unfunded", balanceMicro: 9_999 })
    expect(paidFetch).not.toHaveBeenCalled()
  })

  it("still tries the payment when the balance cannot be read", async () => {
    const signer = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(6))
    const { rpc } = await fakeWalletRpc({ failRead: new Error("rpc down") })
    const paidFetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 402 }))
    expect(await createWalletHire({ signer, rpc, paidFetch, baseUrl: "https://a.test", priceMicro: 10_000 })(agent, "x"))
      .toEqual({ ok: false, error: "the agent's endpoint did not accept the payment" })
    expect(paidFetch).toHaveBeenCalledTimes(1)
  })
})

describe("createChatRunDeps", () => {
  it("switches hiring off for a browser without an agents' wallet", async () => {
    const deps = await createChatRunDeps("https://a.test/api/connections/chat", { uid: UID, wallet: null }, {})
    expect(deps.hire).toBeNull()
    expect(deps.wallet).toBeNull()
    expect(deps.owner).toBe(UID)
    expect(deps.approvals).toBeNull()
    expect(deps.priceMicro).toBe(10_000)
    expect(deps.caps).toEqual({ maxDepth: 2, maxPerRun: 4 })
    expect(deps.budget).toEqual({ perRunMicro: 50_000, perDayMicro: 500_000, hardDayMicro: 2_000_000 })
    expect(typeof deps.modelFor({ provider: "groq", model: "llama", apiKey: "gsk-12345678" })).toBe("object")
  })

  it("pays from the browser's own wallet, with the caps and approvals from the env", async () => {
    const wallet = await createAgentWallet(UID)
    const { rpc } = await fakeWalletRpc()
    const deps = await createChatRunDeps("https://a.test/api/connections/chat", { uid: UID, wallet }, {
      BETTER_AUTH_SECRET: "test-secret",
      ORCHESTRATOR_MAX_USDC_PER_RUN: "0.02",
      SOLANA_DEVNET_RPC_URL: "https://api.devnet.solana.com",
    }, rpc)
    expect(typeof deps.hire).toBe("function")
    expect(deps.wallet).toEqual({ address: wallet.address })
    expect(deps.approvals).not.toBeNull()
    expect(deps.budget.perRunMicro).toBe(20_000)
    // An empty wallet answers "unfunded" before any payment is attempted.
    expect(await deps.hire!(agent, "x")).toMatchObject({ ok: false, code: "unfunded" })
  })
})
