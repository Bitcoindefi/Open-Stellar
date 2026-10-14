import { describe, expect, it } from "vitest"
import { ARC_SYSTEM_EMITTER, ARC_USDC_ADDRESS } from "@/lib/rails/arc/constants"
import { TRANSFER_TOPIC, findUsdcPayment, usdcTransfersFromLogs, type ReceiptLog } from "@/lib/rails/arc/receipt"
import { keccak256, toBytes } from "viem"

// The real settle from the phase 0 spike (Arc testnet tx 0x9c5d...df3b, block 67103748):
// 0.01 USDC from the payer to the treasury, logged twice (ERC-20 emitter and system emitter).
const PAYER = "0x459E57c355b455Ef5544200B521e9b8994D8a451"
const TREASURY = "0x61A3be1Cd5908017af06D5517E42817Fa3bE149d"

function topic(address: string) {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`
}

function transferLog(emitter: string, from: string, to: string, value: bigint): ReceiptLog {
  return { address: emitter, topics: [TRANSFER_TOPIC, topic(from), topic(to)], data: `0x${value.toString(16).padStart(64, "0")}` }
}

const spikeLogs: ReceiptLog[] = [
  transferLog(ARC_SYSTEM_EMITTER, PAYER, TREASURY, BigInt("10000000000000000")),
  transferLog(ARC_USDC_ADDRESS, PAYER, TREASURY, BigInt(10_000)),
]

describe("Arc USDC receipt parsing", () => {
  it("uses the documented Transfer topic", () => {
    expect(TRANSFER_TOPIC).toBe(keccak256(toBytes("Transfer(address,address,uint256)")))
  })

  it("keeps only the ERC-20 emitter's Transfer (6 decimals) and ignores the system emitter", () => {
    const transfers = usdcTransfersFromLogs(spikeLogs)
    expect(transfers).toEqual([{ from: PAYER.toLowerCase(), to: TREASURY.toLowerCase(), value: BigInt(10_000) }])
  })

  it("finds the payment by recipient, payer and minimum amount", () => {
    const receipt = { status: "success", logs: spikeLogs }
    expect(findUsdcPayment(receipt, { to: TREASURY, from: PAYER, minAmount: BigInt(10_000) })?.value).toBe(BigInt(10_000))
    expect(findUsdcPayment(receipt, { to: TREASURY, minAmount: BigInt(10_001) })).toBeNull()
    expect(findUsdcPayment(receipt, { to: PAYER, minAmount: BigInt(1) })).toBeNull()
    expect(findUsdcPayment(receipt, { to: TREASURY, from: TREASURY, minAmount: BigInt(1) })).toBeNull()
  })

  it("never counts a reverted transaction or a system-only log", () => {
    expect(findUsdcPayment({ status: "reverted", logs: spikeLogs }, { to: TREASURY, minAmount: BigInt(1) })).toBeNull()
    expect(findUsdcPayment({ status: "success", logs: [spikeLogs[0]] }, { to: TREASURY, minAmount: BigInt(1) })).toBeNull()
  })

  it("skips malformed logs", () => {
    const bad: ReceiptLog[] = [
      { address: ARC_USDC_ADDRESS, topics: [TRANSFER_TOPIC], data: "0x01" },
      { address: ARC_USDC_ADDRESS, topics: ["0x1234", topic(PAYER), topic(TREASURY)], data: "0x01" },
      { address: ARC_USDC_ADDRESS, topics: [TRANSFER_TOPIC, topic(PAYER), topic(TREASURY)], data: "not hex" },
    ]
    expect(usdcTransfersFromLogs(bad)).toEqual([])
  })
})
