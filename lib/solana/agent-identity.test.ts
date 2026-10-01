import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import {
  IdentityError,
  addressExplorerUrl,
  agentAssetKeypair,
  buildRegistrationFile,
  getIdentityStatus,
  getServerKeypair,
  prepareFeedback,
  registerAgentIdentity,
  registrationUri,
  resetReviewedPaymentsForTests,
  type IdentityDeps,
} from "@/lib/solana/agent-identity"

const server = Keypair.fromSeed(new Uint8Array(32).fill(7))
const payer = Keypair.fromSeed(new Uint8Array(32).fill(9))
const TREASURY = server.publicKey.toBase58()
const USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
const BLOCKHASH = "11111111111111111111111111111111"

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
    getSummary: vi.fn().mockResolvedValue({ averageScore: 92.5, totalFeedbacks: 4 }),
    giveFeedback: vi.fn(async () => ({ transaction: unsignedTx(payer.publicKey), blockhash: BLOCKHASH, lastValidBlockHeight: 10, signer: payer.publicKey.toBase58(), signed: false, feedbackIndex: BigInt(0) })),
  }
  const connection = {
    sendRawTransaction: vi.fn().mockResolvedValue("register-sig"),
    confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    getTransaction: vi.fn().mockResolvedValue(overrides.getTransaction === undefined ? {
      meta: { err: null, postTokenBalances: [{ owner: TREASURY, mint: USDC }] },
      transaction: { message: { staticAccountKeys: [payer.publicKey, server.publicKey] } },
    } : overrides.getTransaction),
  }
  const deps = { createSdk: vi.fn(() => sdk), connection: () => connection } as unknown as IdentityDeps
  return { deps, sdk, connection }
}

describe("8004 agent identity", () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env.SOLANA_SERVER_SECRET = JSON.stringify(Array.from(server.secretKey))
    process.env.X402_SOLANA_PAY_TO = TREASURY
    resetReviewedPaymentsForTests()
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
    expect(status).toMatchObject({ registered: true, reputation: { averageScore: 92.5, totalFeedbacks: 4 } })
    sdk.getSummary.mockRejectedValue(new Error("indexer lag"))
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

  it("prepares a review only for a real payment, with the treasury as fee payer", async () => {
    const { deps, sdk } = makeDeps({ loadAgent: {} })
    const result = await prepareFeedback({ agentId: "agent-1", score: 100, paymentSignature: "pay-sig", payer: payer.publicKey.toBase58() }, deps)
    const tx = Transaction.from(Buffer.from(result.transaction, "base64"))
    expect(tx.feePayer?.equals(server.publicKey)).toBe(true)
    expect(tx.signatures.find((s) => s.publicKey.equals(server.publicKey))?.signature).not.toBeNull()
    const [, params, options] = sdk.giveFeedback.mock.calls[0] as unknown as [PublicKey, Record<string, unknown>, Record<string, PublicKey | boolean>]
    expect(params).toMatchObject({ score: 100, tag1: "x402-resource-delivered", tag2: "exact-svm", feedbackUri: "https://explorer.solana.com/tx/pay-sig?cluster=devnet" })
    expect((options.signer as PublicKey).equals(payer.publicKey)).toBe(true)
    expect((options.feePayer as PublicKey).equals(server.publicKey)).toBe(true)
  })

  it("refuses reviews without proof, with bad input, from the owner, or too many times", async () => {
    const base = { agentId: "agent-1", score: 90, paymentSignature: "pay-sig", payer: payer.publicKey.toBase58() }
    await expect(prepareFeedback(base, makeDeps({ getTransaction: null, loadAgent: {} }).deps)).rejects.toMatchObject({ status: 403 })
    await expect(prepareFeedback(base, makeDeps({ loadAgent: {}, getTransaction: { meta: { err: null, postTokenBalances: [{ owner: "someone-else", mint: USDC }] }, transaction: { message: { staticAccountKeys: [payer.publicKey] } } } }).deps)).rejects.toMatchObject({ status: 403 })
    await expect(prepareFeedback({ ...base, score: 101 }, makeDeps().deps)).rejects.toMatchObject({ status: 400 })
    await expect(prepareFeedback({ ...base, payer: "not-a-key" }, makeDeps().deps)).rejects.toMatchObject({ status: 400 })
    await expect(prepareFeedback({ ...base, payer: TREASURY }, makeDeps().deps)).rejects.toMatchObject({ status: 400 })
    await expect(prepareFeedback(base, makeDeps({ loadAgent: null }).deps)).rejects.toMatchObject({ status: 409 })
    delete process.env.X402_SOLANA_PAY_TO
    await expect(prepareFeedback(base, makeDeps().deps)).rejects.toMatchObject({ status: 503 })
    process.env.X402_SOLANA_PAY_TO = TREASURY

    const { deps } = makeDeps({ loadAgent: {} })
    for (let i = 0; i < 3; i += 1) await prepareFeedback({ ...base, paymentSignature: "repeat" }, deps)
    await expect(prepareFeedback({ ...base, paymentSignature: "repeat" }, deps)).rejects.toMatchObject({ status: 409 })
  })
})
