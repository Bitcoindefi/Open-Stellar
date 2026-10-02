import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import {
  IdentityError,
  addressExplorerUrl,
  agentAssetKeypair,
  buildRegistrationFile,
  checkPaymentTransaction,
  getIdentityStatus,
  getServerKeypair,
  prepareFeedback,
  registerAgentIdentity,
  registrationUri,
  tokenBalanceChange,
  type IdentityDeps,
} from "@/lib/solana/agent-identity"
import { scopedAgentKey } from "@/lib/solana/agent-owner"
import { recordAgentPayment } from "@/lib/solana/payment-bindings"
import { USDC_DEVNET_MINT } from "@/lib/solana/x402"
import { createMemoryStore, setKvStoreForTests } from "@/lib/security/kv-store"

const server = Keypair.fromSeed(new Uint8Array(32).fill(7))
const payer = Keypair.fromSeed(new Uint8Array(32).fill(9))
const facilitator = Keypair.fromSeed(new Uint8Array(32).fill(11))
const TREASURY = server.publicKey.toBase58()
const PAYER = payer.publicKey.toBase58()
const USDC = USDC_DEVNET_MINT
const BLOCKHASH = "11111111111111111111111111111111"
const OWNER_A = "a".repeat(20)
const OWNER_B = "b".repeat(20)
const NOW_MS = Date.UTC(2026, 9, 1, 12)
const NOW_S = NOW_MS / 1000

/** A confirmed x402 payment: payer -> treasury, 0.01 USDC, facilitator pays the fee. */
function paymentTx(overrides: { signers?: number; blockTime?: number | null; meta?: unknown } = {}) {
  return {
    blockTime: overrides.blockTime === undefined ? NOW_S - 60 : overrides.blockTime,
    meta: overrides.meta !== undefined ? overrides.meta : {
      err: null,
      preTokenBalances: [
        { accountIndex: 2, mint: USDC, owner: PAYER, uiTokenAmount: { amount: "50000" } },
        { accountIndex: 3, mint: USDC, owner: TREASURY, uiTokenAmount: { amount: "0" } },
      ],
      postTokenBalances: [
        { accountIndex: 2, mint: USDC, owner: PAYER, uiTokenAmount: { amount: "40000" } },
        { accountIndex: 3, mint: USDC, owner: TREASURY, uiTokenAmount: { amount: "10000" } },
      ],
    },
    transaction: { message: { header: { numRequiredSignatures: overrides.signers ?? 2 }, staticAccountKeys: [facilitator.publicKey, payer.publicKey, server.publicKey] } },
  }
}

function unsignedTx(feePayer: PublicKey) {
  const tx = new Transaction({ feePayer, recentBlockhash: BLOCKHASH }).add(SystemProgram.transfer({ fromPubkey: feePayer, toPubkey: payer.publicKey, lamports: 1 }))
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64")
}

function makeDeps(overrides: { loadAgent?: unknown; getTransaction?: unknown; registerTx?: string } = {}) {
  const sdk = {
    loadAgent: vi.fn().mockResolvedValue(overrides.loadAgent === undefined ? null : overrides.loadAgent),
    registerAgent: vi.fn(async (_uri: string, options: { assetPubkey: PublicKey }) => {
      const tx = new Transaction({ feePayer: server.publicKey, recentBlockhash: BLOCKHASH }).add(SystemProgram.transfer({ fromPubkey: server.publicKey, toPubkey: options.assetPubkey, lamports: 1 }))
      tx.add(SystemProgram.transfer({ fromPubkey: options.assetPubkey, toPubkey: server.publicKey, lamports: 1 }))
      return { transaction: overrides.registerTx ?? tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"), blockhash: BLOCKHASH, lastValidBlockHeight: 10, signer: TREASURY, signed: false, asset: options.assetPubkey }
    }),
    readAllFeedback: vi.fn().mockResolvedValue([{ score: 100, revoked: false }, { score: 85, revoked: false }, { score: 0, revoked: true }, { score: null, revoked: false }]),
    giveFeedback: vi.fn(async () => ({ transaction: unsignedTx(payer.publicKey), blockhash: BLOCKHASH, lastValidBlockHeight: 10, signer: payer.publicKey.toBase58(), signed: false, feedbackIndex: BigInt(0) })),
  }
  const connection = {
    sendRawTransaction: vi.fn().mockResolvedValue("register-sig"),
    confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    getTransaction: vi.fn().mockResolvedValue(overrides.getTransaction === undefined ? paymentTx() : overrides.getTransaction),
  }
  const deps = { createSdk: vi.fn(() => sdk), connection: () => connection, now: () => NOW_MS } as unknown as IdentityDeps
  return { deps, sdk, connection }
}

describe("8004 agent identity", () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env.SOLANA_SERVER_SECRET = JSON.stringify(Array.from(server.secretKey))
    process.env.X402_SOLANA_PAY_TO = TREASURY
  })
  afterEach(() => { process.env = { ...env } })

  it("derives a stable, per-agent asset address from the server key", () => {
    expect(getServerKeypair()?.publicKey.equals(server.publicKey)).toBe(true)
    const a = agentAssetKeypair(server, "agent-1").publicKey
    expect(agentAssetKeypair(server, " agent-1 ").publicKey.equals(a)).toBe(true)
    expect(agentAssetKeypair(server, "agent-2").publicKey.equals(a)).toBe(false)
    expect(addressExplorerUrl("abc")).toBe("https://explorer.solana.com/address/abc?cluster=devnet")
  })

  it("rejects missing or malformed server secrets", async () => {
    process.env.SOLANA_SERVER_SECRET = "not json"
    expect(getServerKeypair()).toBeNull()
    process.env.SOLANA_SERVER_SECRET = "[1,2,3]"
    expect(getServerKeypair()).toBeNull()
    delete process.env.SOLANA_SERVER_SECRET
    await expect(getIdentityStatus("a", makeDeps().deps)).rejects.toMatchObject({ status: 503 })
  })

  it("builds a short registration URI and an 8004 registration file", () => {
    const uri = registrationUri("https://agentic-city.test", { id: "agent-1", name: "Investigador", role: "r", model: "x-ai/grok-4" })
    expect(uri.length).toBeLessThanOrEqual(250)
    const file = buildRegistrationFile("https://agentic-city.test", "agent-1", new URL(uri).searchParams, "Asset111")
    expect(file).toMatchObject({ name: "Investigador", x402Support: true, registrations: [{ agentId: "Asset111", agentRegistry: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C" }] })
    expect(file.services[0].endpoint).toBe("https://agentic-city.test/api/x402/agents/agent-1/task")
    expect(buildRegistrationFile("https://agentic-city.test", "bot", new URLSearchParams(), null).registrations).toEqual([])
    const long = registrationUri("https://agentic-city.test", { id: "x".repeat(80), name: "n".repeat(40), role: "", model: "m".repeat(60) })
    expect(long.length).toBeLessThanOrEqual(250)
  })

  it("reports status with reputation, and tolerates an indexer that is not ready", async () => {
    const { deps, sdk } = makeDeps({ loadAgent: { owner: TREASURY } })
    const status = await getIdentityStatus("agent-1", deps)
    expect(status).toMatchObject({ registered: true, reputation: { averageScore: 93, totalFeedbacks: 2 } })
    sdk.readAllFeedback.mockRejectedValue(new Error("indexer lag"))
    expect((await getIdentityStatus("agent-1", deps)).reputation).toBeNull()
    expect((await getIdentityStatus("agent-1", makeDeps().deps)).registered).toBe(false)
  })

  it("registers once, signed by the treasury and the derived asset", async () => {
    const { deps, sdk, connection } = makeDeps()
    const result = await registerAgentIdentity({ id: "agent-1", name: "Investigador", role: "r", model: "m" }, "https://agentic-city.test", deps)
    expect(result).toEqual({ asset: agentAssetKeypair(server, "agent-1").publicKey.toBase58(), signature: "register-sig", alreadyRegistered: false })
    const options = sdk.registerAgent.mock.calls[0][1]
    expect(options).toMatchObject({ skipSend: true, signer: server.publicKey })
    const sent = Transaction.from(connection.sendRawTransaction.mock.calls[0][0])
    expect(sent.verifySignatures()).toBe(true)

    const again = await registerAgentIdentity({ id: "agent-1", name: "x", role: "", model: "" }, "https://agentic-city.test", makeDeps({ loadAgent: {} }).deps)
    expect(again.alreadyRegistered).toBe(true)
  })

  it("fails registration when the registry returns no transaction", async () => {
    const { deps, sdk } = makeDeps()
    sdk.registerAgent.mockResolvedValue({ signature: "x", success: true } as never)
    await expect(registerAgentIdentity({ id: "a", name: "a", role: "", model: "" }, "https://agentic-city.test", deps)).rejects.toBeInstanceOf(IdentityError)
  })

  it("namespaces assets by owner and keeps the legacy derivation without one", () => {
    const legacy = agentAssetKeypair(server, "worker-1").publicKey
    const alice = agentAssetKeypair(server, "worker-1", OWNER_A).publicKey
    const bob = agentAssetKeypair(server, "worker-1", OWNER_B).publicKey
    expect(alice.equals(legacy)).toBe(false)
    expect(alice.equals(bob)).toBe(false)
    expect(agentAssetKeypair(server, "worker-1", "not-a-tag").publicKey.equals(legacy)).toBe(true)
    const uri = new URL(registrationUri("https://agentic-city.test", { id: "worker-1", name: "R", role: "", model: "m", ownerTag: OWNER_A }))
    expect(uri.searchParams.get("o")).toBe(OWNER_A)
  })

  it("registers and reads the owner-scoped asset", async () => {
    const { deps, sdk } = makeDeps({ loadAgent: {} })
    const status = await getIdentityStatus({ id: "worker-1", ownerTag: OWNER_A }, deps)
    expect(status.asset).toBe(agentAssetKeypair(server, "worker-1", OWNER_A).publicKey.toBase58())
    expect((sdk.loadAgent.mock.calls[0][0] as PublicKey).toBase58()).toBe(status.asset)
    const registered = await registerAgentIdentity({ id: "worker-1", name: "R", role: "", model: "", ownerTag: OWNER_B }, "https://agentic-city.test", makeDeps().deps)
    expect(registered.asset).toBe(agentAssetKeypair(server, "worker-1", OWNER_B).publicKey.toBase58())
  })
})

describe("payment checks for reviews", () => {
  const meta = (payerPre: string, payerPost: string, treasuryPre: string | null, treasuryPost: string) => ({
    err: null,
    preTokenBalances: [
      { accountIndex: 2, mint: USDC, owner: PAYER, uiTokenAmount: { amount: payerPre } },
      ...(treasuryPre === null ? [] : [{ accountIndex: 3, mint: USDC, owner: TREASURY, uiTokenAmount: { amount: treasuryPre } }]),
    ],
    postTokenBalances: [
      { accountIndex: 2, mint: USDC, owner: PAYER, uiTokenAmount: { amount: payerPost } },
      { accountIndex: 3, mint: USDC, owner: TREASURY, uiTokenAmount: { amount: treasuryPost } },
    ],
  })
  const expected = { payer: PAYER, treasury: TREASURY, minAmount: BigInt(10000), nowMs: NOW_MS }

  it("sums balance changes per owner and mint", () => {
    expect(tokenBalanceChange(meta("50000", "40000", "5", "10005"), TREASURY, USDC)).toBe(BigInt(10000))
    expect(tokenBalanceChange(meta("50000", "40000", null, "10000"), TREASURY, USDC)).toBe(BigInt(10000))
    expect(tokenBalanceChange(meta("50000", "40000", "0", "10000"), PAYER, USDC)).toBe(BigInt(-10000))
    expect(tokenBalanceChange(meta("50000", "40000", "0", "10000"), PAYER, "other-mint")).toBe(BigInt(0))
    expect(tokenBalanceChange({ postTokenBalances: [{ accountIndex: 1, mint: USDC, owner: PAYER, uiTokenAmount: { amount: "x" } }] }, PAYER, USDC)).toBe(BigInt(0))
    expect(tokenBalanceChange({}, PAYER, USDC)).toBe(BigInt(0))
  })

  it("accepts a recent payment of the task price, signed by the payer", () => {
    expect(checkPaymentTransaction(paymentTx() as never, expected)).toBeNull()
    // Not a signer, but the owner whose balance decreased: still accepted.
    expect(checkPaymentTransaction(paymentTx({ signers: 1 }) as never, expected)).toBeNull()
  })

  it("rejects missing, failed, underpaid, misdirected, unsigned and stale payments", () => {
    expect(checkPaymentTransaction(null, expected)).toMatch(/not found/)
    expect(checkPaymentTransaction(paymentTx({ meta: null }) as never, expected)).toMatch(/not found/)
    expect(checkPaymentTransaction(paymentTx({ meta: { ...meta("50000", "40000", "0", "10000"), err: { InstructionError: [0, "x"] } } }) as never, expected)).toMatch(/failed/)
    // Treasury only appears in postTokenBalances with no increase (the original bypass).
    expect(checkPaymentTransaction(paymentTx({ meta: meta("50000", "40000", "10000", "10000") }) as never, expected)).toMatch(/treasury/)
    expect(checkPaymentTransaction(paymentTx({ meta: meta("50000", "49999", "0", "1") }) as never, expected)).toMatch(/payer did not pay/)
    expect(checkPaymentTransaction(paymentTx({ meta: meta("50000", "40000", "0", "9999") }) as never, expected)).toMatch(/treasury/)
    // Payer neither signed nor paid.
    expect(checkPaymentTransaction(paymentTx({ signers: 1, meta: meta("50000", "50000", "0", "10000") }) as never, expected)).toMatch(/did not sign/)
    expect(checkPaymentTransaction(paymentTx({ blockTime: NOW_S - 3601 }) as never, expected)).toMatch(/too old/)
    expect(checkPaymentTransaction(paymentTx({ blockTime: null }) as never, expected)).toMatch(/too old/)
    expect(checkPaymentTransaction(paymentTx({ blockTime: NOW_S + 3600 }) as never, expected)).toMatch(/too old/)
  })
})

describe("prepareFeedback", () => {
  const env = { ...process.env }
  const SIG = "5".repeat(88)
  const base = { agentId: "agent-1", score: 90, paymentSignature: SIG, payer: PAYER }

  beforeEach(async () => {
    process.env.SOLANA_SERVER_SECRET = JSON.stringify(Array.from(server.secretKey))
    process.env.X402_SOLANA_PAY_TO = TREASURY
    setKvStoreForTests(createMemoryStore())
    await recordAgentPayment(SIG, scopedAgentKey("agent-1", null))
  })
  afterEach(() => {
    process.env = { ...env }
    setKvStoreForTests(null)
  })

  it("prepares a review for a bound, real payment, with the treasury as fee payer", async () => {
    const { deps, sdk, connection } = makeDeps({ loadAgent: {} })
    const result = await prepareFeedback({ ...base, score: 100 }, deps)
    const tx = Transaction.from(Buffer.from(result.transaction, "base64"))
    expect(tx.feePayer?.equals(server.publicKey)).toBe(true)
    expect(tx.signatures.find((s) => s.publicKey.equals(server.publicKey))?.signature).not.toBeNull()
    expect(connection.getTransaction.mock.calls[0][0]).toBe(SIG)
    const [, params, options] = sdk.giveFeedback.mock.calls[0] as unknown as [PublicKey, Record<string, unknown>, Record<string, PublicKey | boolean>]
    expect(params).toMatchObject({ score: 100, tag1: "x402-resource-delivered", tag2: "exact-svm", feedbackUri: `https://explorer.solana.com/tx/${SIG}?cluster=devnet` })
    expect((options.signer as PublicKey).equals(payer.publicKey)).toBe(true)
    expect((options.feePayer as PublicKey).equals(server.publicKey)).toBe(true)
  })

  it("allows one review per payment", async () => {
    const { deps } = makeDeps({ loadAgent: {} })
    await prepareFeedback(base, deps)
    await expect(prepareFeedback(base, deps)).rejects.toMatchObject({ status: 409, message: "This payment was already reviewed." })
  })

  it("gives the review back when the registry fails to build it", async () => {
    const { deps, sdk } = makeDeps({ loadAgent: {} })
    sdk.giveFeedback.mockResolvedValueOnce({ signature: "x", success: true } as never)
    await expect(prepareFeedback(base, deps)).rejects.toMatchObject({ status: 502 })
    await expect(prepareFeedback(base, deps)).resolves.toHaveProperty("transaction")
  })

  it("only accepts payments bound to this agent of this owner", async () => {
    const { deps, connection } = makeDeps({ loadAgent: {} })
    await expect(prepareFeedback({ ...base, agentId: "agent-2" }, deps)).rejects.toMatchObject({ status: 403 })
    await expect(prepareFeedback({ ...base, ownerTag: OWNER_A }, deps)).rejects.toMatchObject({ status: 403 })
    await expect(prepareFeedback({ ...base, paymentSignature: "6".repeat(88) }, deps)).rejects.toMatchObject({ status: 403 })
    expect(connection.getTransaction).not.toHaveBeenCalled()

    const owned = "7".repeat(88)
    await recordAgentPayment(owned, scopedAgentKey("agent-1", OWNER_A))
    const ok = await prepareFeedback({ ...base, paymentSignature: owned, ownerTag: OWNER_A }, deps)
    expect(ok.asset).toBe(agentAssetKeypair(server, "agent-1", OWNER_A).publicKey.toBase58())
  })

  it("refuses reviews without on-chain proof, with bad input, or from the owner", async () => {
    await expect(prepareFeedback(base, makeDeps({ getTransaction: null, loadAgent: {} }).deps)).rejects.toMatchObject({ status: 403 })
    await expect(prepareFeedback(base, makeDeps({ getTransaction: paymentTx({ blockTime: NOW_S - 7200 }), loadAgent: {} }).deps)).rejects.toMatchObject({ status: 403 })
    await expect(prepareFeedback({ ...base, score: 101 }, makeDeps().deps)).rejects.toMatchObject({ status: 400 })
    await expect(prepareFeedback({ ...base, payer: "not-a-key" }, makeDeps().deps)).rejects.toMatchObject({ status: 400 })
    await expect(prepareFeedback({ ...base, payer: TREASURY }, makeDeps().deps)).rejects.toMatchObject({ status: 400 })
    await expect(prepareFeedback({ ...base, paymentSignature: "not a signature" }, makeDeps().deps)).rejects.toMatchObject({ status: 400 })
    await expect(prepareFeedback(base, makeDeps({ loadAgent: null }).deps)).rejects.toMatchObject({ status: 409 })
    delete process.env.X402_SOLANA_PAY_TO
    await expect(prepareFeedback(base, makeDeps().deps)).rejects.toMatchObject({ status: 503 })
  })
})
