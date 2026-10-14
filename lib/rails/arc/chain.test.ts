import { describe, expect, it } from "vitest"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { ARC_SYSTEM_EMITTER, ARC_USDC_ADDRESS } from "@/lib/rails/arc/constants"
import { withdrawArcUsdc, type ArcChain } from "@/lib/rails/arc/chain"
import { TRANSFER_TOPIC } from "@/lib/rails/arc/receipt"

const agent = privateKeyToAccount(generatePrivateKey())
const person = privateKeyToAccount(generatePrivateKey()).address
const HASH = `0x${"cd".repeat(32)}` as `0x${string}`
const topic = (address: string) => `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`

function fakeChain(balance: bigint, status = "success") {
  const sent: Array<{ to: string; amount: bigint }> = []
  const chain: ArcChain = {
    usdcBalance: async () => balance,
    transferUsdc: async (_account, to, amount) => {
      sent.push({ to, amount })
      return HASH
    },
    waitForReceipt: async () => ({
      status,
      logs: sent.flatMap(({ to, amount }) => [
        { address: ARC_SYSTEM_EMITTER, topics: [TRANSFER_TOPIC, topic(agent.address), topic(to)], data: `0x${(amount * BigInt("1000000000000")).toString(16)}` },
        { address: ARC_USDC_ADDRESS, topics: [TRANSFER_TOPIC, topic(agent.address), topic(to)], data: `0x${amount.toString(16)}` },
      ]),
    }),
  }
  return { chain, sent }
}

describe("Arc agents' wallet withdrawal", () => {
  it("sends the USDC balance minus the gas reserve and confirms it from the ERC-20 log", async () => {
    const { chain, sent } = fakeChain(BigInt(110_000))
    const result = await withdrawArcUsdc({ chain, agent, destination: person })
    expect(result).toEqual({ ok: true, hash: HASH, amountMicro: BigInt(100_000), confirmed: true })
    expect(sent).toEqual([{ to: person, amount: BigInt(100_000) }])
  })

  it("refuses dust, its own address and a bad destination", async () => {
    expect(await withdrawArcUsdc({ chain: fakeChain(BigInt(10_000)).chain, agent, destination: person })).toMatchObject({ ok: false, status: 409 })
    expect(await withdrawArcUsdc({ chain: fakeChain(BigInt(110_000)).chain, agent, destination: agent.address })).toMatchObject({ ok: false, status: 400 })
    expect(await withdrawArcUsdc({ chain: fakeChain(BigInt(110_000)).chain, agent, destination: "nope" })).toMatchObject({ ok: false, status: 400 })
  })

  it("reports a reverted transfer", async () => {
    expect(await withdrawArcUsdc({ chain: fakeChain(BigInt(110_000), "reverted").chain, agent, destination: person })).toMatchObject({ ok: false, status: 502 })
  })
})
