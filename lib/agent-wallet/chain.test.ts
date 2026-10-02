import { describe, expect, it, vi } from "vitest"
import { createKeyPairSignerFromPrivateKeyBytes, getCompiledTransactionMessageDecoder, getTransactionDecoder } from "@solana/kit"
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token"
import { createWalletRpc, getUsdcBalance, serverRpcUrl, waitForConfirmation, withdrawAll, type WalletRpc } from "@/lib/agent-wallet/chain"
import { usdcAccountFor } from "@/lib/agent-wallet/fund-tx"
import { fakeWalletRpc } from "@/__tests__/helpers/fake-wallet-rpc"

async function signers() {
  const agent = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(11))
  const feePayer = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(12))
  const person = (await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(13))).address
  return { agent, feePayer, person }
}

const noWait = { sleep: async () => undefined }

describe("serverRpcUrl", () => {
  it("prefers the dedicated devnet RPC, then SOLANA_RPC, then the public one", () => {
    expect(serverRpcUrl({ SOLANA_DEVNET_RPC_URL: " https://a ", SOLANA_RPC: "https://b" })).toBe("https://a")
    expect(serverRpcUrl({ SOLANA_RPC: "https://b" })).toBe("https://b")
    expect(serverRpcUrl({})).toBe("https://api.devnet.solana.com")
    expect(typeof createWalletRpc("https://api.devnet.solana.com").getAccountInfo).toBe("function")
  })
})

describe("getUsdcBalance", () => {
  it("reads the USDC account of the wallet, and 0 when it has none", async () => {
    const { agent, person } = await signers()
    const { rpc } = await fakeWalletRpc({ balances: { [agent.address]: BigInt(123456), [person]: null } })
    expect(await getUsdcBalance(rpc, agent.address)).toBe(BigInt(123456))
    expect(await getUsdcBalance(rpc, person)).toBe(BigInt(0))
    expect(rpc.getAccountInfo).toHaveBeenCalledWith(await usdcAccountFor(agent.address), { encoding: "jsonParsed", commitment: "confirmed" })
  })

  it("throws on an account it cannot read, so callers never guess a balance", async () => {
    const rpc = { getAccountInfo: () => ({ send: async () => ({ value: { data: ["raw", "base64"] } }) }) } as unknown as WalletRpc
    await expect(getUsdcBalance(rpc, (await signers()).agent.address)).rejects.toThrow("could not be read")
  })
})

describe("waitForConfirmation", () => {
  it("polls until confirmed, gives up after the attempts, and reports an on-chain error", async () => {
    expect(await waitForConfirmation((await fakeWalletRpc({ confirmAfter: 3 })).rpc, "sig", noWait)).toBe(true)
    expect(await waitForConfirmation((await fakeWalletRpc({ confirmAfter: 9 })).rpc, "sig", { ...noWait, attempts: 2 })).toBe(false)
    await expect(waitForConfirmation((await fakeWalletRpc({ statusError: { InstructionError: [0, "x"] } })).rpc, "sig", noWait)).rejects.toThrow("failed on-chain")
  })
})

describe("withdrawAll", () => {
  it("sends every USDC back and closes the account; the agents' wallet signs, the server pays the fee", async () => {
    const { agent, feePayer, person } = await signers()
    const { rpc, sent } = await fakeWalletRpc({ balances: { [agent.address]: BigInt(70000), [person]: BigInt(5) } })
    const result = await withdrawAll({ rpc, agent, feePayer, destination: person, confirm: noWait })
    expect(result).toMatchObject({ ok: true, amountMicro: BigInt(70000), confirmed: true })

    expect(sent).toHaveLength(1)
    const transaction = getTransactionDecoder().decode(Buffer.from(sent[0], "base64"))
    const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes)
    expect(message.staticAccounts[0]).toBe(feePayer.address)
    expect(message.header.numSignerAccounts).toBe(2)
    expect(Object.keys(transaction.signatures).sort()).toEqual([agent.address, feePayer.address].sort())
    expect(Object.values(transaction.signatures).every((signature) => signature && signature.some((byte) => byte !== 0))).toBe(true)
    if (result.ok) expect(result.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{60,90}$/)

    const [transfer, close] = message.instructions
    const at = (ix: typeof transfer, i: number) => message.staticAccounts[ix.accountIndices![i]]
    expect(message.staticAccounts[transfer.programAddressIndex]).toBe(TOKEN_PROGRAM_ADDRESS)
    expect(transfer.data![0]).toBe(12)
    expect(Buffer.from(transfer.data!.slice(1, 9)).readBigUInt64LE()).toBe(BigInt(70000))
    expect(at(transfer, 0)).toBe(await usdcAccountFor(agent.address))
    expect(at(transfer, 2)).toBe(await usdcAccountFor(person))
    expect(at(transfer, 3)).toBe(agent.address)
    expect(close.data![0]).toBe(9) // CloseAccount: the rent goes back to the server, which paid it
    expect(at(close, 1)).toBe(feePayer.address)
  })

  it("refuses when there is nothing to withdraw, the destination has no USDC account, or the addresses are wrong", async () => {
    const { agent, feePayer, person } = await signers()
    const empty = await fakeWalletRpc({ balances: { [person]: BigInt(1) } })
    expect(await withdrawAll({ rpc: empty.rpc, agent, feePayer, destination: person })).toEqual({ ok: false, status: 409, error: "The agents' wallet has no USDC to withdraw." })
    const noAccount = await fakeWalletRpc({ balances: { [agent.address]: BigInt(10) } })
    expect(await withdrawAll({ rpc: noAccount.rpc, agent, feePayer, destination: person })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("no devnet USDC account") })
    expect(noAccount.sent).toEqual([])
    expect(await withdrawAll({ rpc: noAccount.rpc, agent, feePayer, destination: agent.address })).toMatchObject({ ok: false, status: 400 })
    expect(await withdrawAll({ rpc: noAccount.rpc, agent, feePayer: agent, destination: person })).toMatchObject({ ok: false, status: 500 })
  })

  it("lets a send failure propagate to the route", async () => {
    const { agent, feePayer, person } = await signers()
    const { rpc } = await fakeWalletRpc({ balances: { [agent.address]: BigInt(10), [person]: BigInt(0) }, failSend: new Error("insufficient lamports") })
    await expect(withdrawAll({ rpc, agent, feePayer, destination: person, confirm: noWait })).rejects.toThrow("insufficient lamports")
    expect(vi.mocked(rpc.getSignatureStatuses)).not.toHaveBeenCalled()
  })
})
