import { describe, expect, it } from "vitest"
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js"
import { isExpectedAgentPayment, reviewTransactionProblem } from "@/lib/solana/client-guards"
import { DEVNET_REGISTRY_PROGRAM, SOLANA_DEVNET_NETWORK, USDC_DEVNET_MINT } from "@/lib/solana/payment-constants"

const treasury = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey
const reviewer = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey
const BLOCKHASH = "11111111111111111111111111111111"

function bytes(feePayer: PublicKey, ...instructions: TransactionInstruction[]) {
  const tx = new Transaction({ feePayer, recentBlockhash: BLOCKHASH })
  for (const instruction of instructions) tx.add(instruction)
  return new Uint8Array(tx.serialize({ requireAllSignatures: false, verifySignatures: false }))
}

const feedbackIx = () => new TransactionInstruction({ programId: new PublicKey(DEVNET_REGISTRY_PROGRAM), keys: [{ pubkey: reviewer, isSigner: true, isWritable: true }], data: Buffer.from([1, 2, 3]) })

describe("review transaction guard", () => {
  it("accepts a registry review with a compute budget, paid by the treasury", () => {
    expect(reviewTransactionProblem(bytes(treasury, ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), feedbackIx()), treasury.toBase58())).toBeNull()
  })

  it("rejects other programs, another fee payer, bad bytes and an unknown treasury", () => {
    const drain = SystemProgram.transfer({ fromPubkey: reviewer, toPubkey: treasury, lamports: 1_000_000 })
    expect(reviewTransactionProblem(bytes(treasury, feedbackIx(), drain), treasury.toBase58())).toMatch(/unexpected program/)
    expect(reviewTransactionProblem(bytes(reviewer, feedbackIx()), treasury.toBase58())).toBe("unexpected fee payer")
    expect(reviewTransactionProblem(new Uint8Array([1, 2, 3]), treasury.toBase58())).toMatch(/decoded/)
    expect(reviewTransactionProblem(bytes(treasury, feedbackIx()), null)).toBe("unknown fee payer")
  })
})

describe("x402 payment guard", () => {
  const payTo = treasury.toBase58()
  const ok = { scheme: "exact", network: SOLANA_DEVNET_NETWORK, asset: USDC_DEVNET_MINT, amount: "10000", payTo }

  it("accepts the task price in devnet USDC to the treasury", () => {
    expect(isExpectedAgentPayment(ok, payTo)).toBe(true)
    expect(isExpectedAgentPayment({ ...ok, amount: "5000" }, payTo)).toBe(true)
  })

  it("rejects higher amounts, other assets, networks, schemes, recipients and junk", () => {
    expect(isExpectedAgentPayment({ ...ok, amount: "10001" }, payTo)).toBe(false)
    expect(isExpectedAgentPayment({ ...ok, amount: "0" }, payTo)).toBe(false)
    expect(isExpectedAgentPayment({ ...ok, amount: "lots" }, payTo)).toBe(false)
    expect(isExpectedAgentPayment({ ...ok, asset: "So11111111111111111111111111111111111111112" }, payTo)).toBe(false)
    expect(isExpectedAgentPayment({ ...ok, network: "solana:mainnet" }, payTo)).toBe(false)
    expect(isExpectedAgentPayment({ ...ok, scheme: "upto" }, payTo)).toBe(false)
    expect(isExpectedAgentPayment({ ...ok, payTo: reviewer.toBase58() }, payTo)).toBe(false)
    expect(isExpectedAgentPayment(ok, null)).toBe(false)
  })
})
