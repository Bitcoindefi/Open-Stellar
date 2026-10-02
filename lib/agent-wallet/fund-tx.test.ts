import { describe, expect, it } from "vitest"
import { createKeyPairSignerFromPrivateKeyBytes, getCompiledTransactionMessageDecoder, getTransactionDecoder } from "@solana/kit"
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token"
import { FUND_AMOUNT_MICRO, MAX_FUND_AMOUNT_MICRO, buildFundTransaction, buildSponsoredFundTransaction, fundTransactionProblem, usdcAccountFor } from "@/lib/agent-wallet/fund-tx"
import { USDC_DEVNET_MINT } from "@/lib/solana/payment-constants"
import { TEST_BLOCKHASH } from "@/__tests__/helpers/fake-wallet-rpc"

const latestBlockhash = { blockhash: TEST_BLOCKHASH, lastValidBlockHeight: BigInt(100) }

async function addresses() {
  const payer = (await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(1))).address
  const agent = (await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(2))).address
  return { payer, agent }
}

function decode(bytes: Uint8Array) {
  const transaction = getTransactionDecoder().decode(bytes)
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes)
  return { transaction, message }
}

describe("buildFundTransaction", () => {
  it("is one unsigned transaction: create the agents' USDC account if needed, then transfer 0.10 USDC", async () => {
    const { payer, agent } = await addresses()
    const bytes = await buildFundTransaction({ payer, agentWallet: agent, latestBlockhash })
    const { transaction, message } = decode(bytes)

    // The person's wallet is the only signer and pays the fee; nothing is signed yet.
    expect(message.staticAccounts[0]).toBe(payer)
    expect(message.header.numSignerAccounts).toBe(1)
    expect(Object.keys(transaction.signatures)).toEqual([payer])
    expect(transaction.signatures[payer]).toBeNull()
    expect(message.lifetimeToken).toBe(TEST_BLOCKHASH)

    const programs = message.instructions.map((ix) => message.staticAccounts[ix.programAddressIndex])
    expect(programs).toEqual([ASSOCIATED_TOKEN_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS])

    const [create, transfer] = message.instructions
    expect(Array.from(create.data ?? [])).toEqual([1]) // CreateIdempotent
    const ata = await usdcAccountFor(agent)
    const at = (ix: typeof create, i: number) => message.staticAccounts[ix.accountIndices![i]]
    expect(at(create, 1)).toBe(ata)
    expect(at(create, 2)).toBe(agent)
    expect(at(create, 3)).toBe(USDC_DEVNET_MINT)

    const data = transfer.data!
    expect(data[0]).toBe(12) // TransferChecked
    expect(Buffer.from(data.slice(1, 9)).readBigUInt64LE()).toBe(FUND_AMOUNT_MICRO)
    expect(data[9]).toBe(6)
    expect(at(transfer, 0)).toBe(await usdcAccountFor(payer))
    expect(at(transfer, 1)).toBe(USDC_DEVNET_MINT)
    expect(at(transfer, 2)).toBe(ata)
    expect(at(transfer, 3)).toBe(payer)
  })

  it("sponsored: the server pays fee and rent and signs first; the person signs only the transfer", async () => {
    const { payer, agent } = await addresses()
    const feePayer = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(3))
    const base64 = await buildSponsoredFundTransaction({ payer, agentWallet: agent, feePayer, latestBlockhash })
    const bytes = new Uint8Array(Buffer.from(base64, "base64"))
    const { transaction, message } = decode(bytes)
    expect(message.staticAccounts[0]).toBe(feePayer.address)
    expect(message.header.numSignerAccounts).toBe(2)
    expect(transaction.signatures[feePayer.address]?.some((byte) => byte !== 0)).toBe(true)
    expect(transaction.signatures[payer]).toBeNull()
    const create = message.instructions[0]
    expect(message.staticAccounts[create.accountIndices![0]]).toBe(feePayer.address) // rent payer

    const expected = { payer, agentWallet: agent, feePayer: feePayer.address, maxAmountMicro: FUND_AMOUNT_MICRO }
    expect(await fundTransactionProblem(bytes, expected)).toBeNull()
    await expect(buildSponsoredFundTransaction({ payer, agentWallet: agent, feePayer: { ...feePayer, address: payer } as never, latestBlockhash })).rejects.toThrow("server keypair")
  })

  it("the browser refuses a funding transaction that is not exactly what it asked for", async () => {
    const { payer, agent } = await addresses()
    const feePayer = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(3))
    const other = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(4))
    const expected = { payer, agentWallet: agent, feePayer: feePayer.address, maxAmountMicro: FUND_AMOUNT_MICRO }
    const sponsored = (overrides: Record<string, unknown> = {}) => buildSponsoredFundTransaction({ payer, agentWallet: agent, feePayer, latestBlockhash, ...overrides }).then((b64) => new Uint8Array(Buffer.from(b64, "base64")))

    expect(await fundTransactionProblem(new Uint8Array([1, 2, 3]), expected)).toBe("the transaction could not be decoded")
    expect(await fundTransactionProblem(await sponsored(), { ...expected, feePayer: other.address })).toBe("unexpected fee payer")
    expect(await fundTransactionProblem(await sponsored({ amountMicro: FUND_AMOUNT_MICRO + BigInt(1) }), expected)).toBe("unexpected amount")
    expect(await fundTransactionProblem(await sponsored({ agentWallet: other.address }), expected)).toBe("unexpected account creation")
    expect(await fundTransactionProblem(await sponsored(), { ...expected, payer: other.address })).toBe("unexpected signers")
    // The unsponsored version has a single signer, so it is not a valid sponsored transaction.
    expect(await fundTransactionProblem(await buildFundTransaction({ payer, agentWallet: agent, latestBlockhash }), { ...expected, feePayer: payer })).toBe("unexpected signers")
    // A transfer from someone else's account, even with the right shape, is refused.
    const swapped = await buildSponsoredFundTransaction({ payer: other.address, agentWallet: agent, feePayer, latestBlockhash })
    expect(await fundTransactionProblem(new Uint8Array(Buffer.from(swapped, "base64")), { ...expected, payer: other.address, agentWallet: agent })).toBeNull()
    expect(await fundTransactionProblem(new Uint8Array(Buffer.from(swapped, "base64")), expected)).toBe("unexpected signers")
  })

  it("funds a custom amount and refuses nonsense", async () => {
    const { payer, agent } = await addresses()
    const bytes = await buildFundTransaction({ payer, agentWallet: agent, latestBlockhash, amountMicro: BigInt(50000) })
    const transfer = decode(bytes).message.instructions[1]
    expect(Buffer.from(transfer.data!.slice(1, 9)).readBigUInt64LE()).toBe(BigInt(50000))
    await expect(buildFundTransaction({ payer, agentWallet: agent, latestBlockhash, amountMicro: BigInt(0) })).rejects.toThrow("Fund between")
    await expect(buildFundTransaction({ payer, agentWallet: agent, latestBlockhash, amountMicro: MAX_FUND_AMOUNT_MICRO + BigInt(1) })).rejects.toThrow("Fund between")
    await expect(buildFundTransaction({ payer, agentWallet: payer, latestBlockhash })).rejects.toThrow("cannot fund itself")
    await expect(buildFundTransaction({ payer: "nope", agentWallet: agent, latestBlockhash })).rejects.toThrow()
  })
})
