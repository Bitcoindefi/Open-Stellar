import { ARC_USDC_ADDRESS, isEvmAddress } from "@/lib/rails/arc/constants"

// Reading USDC movements out of an Arc transaction receipt. Every USDC transfer on Arc emits two
// Transfer events: one from the USDC ERC-20 contract (0x3600...0000, 6 decimals) and one from the
// system emitter (0xffff...fffe, the same movement in 18 decimals). Only the first one counts;
// counting both would double the volume and scale amounts by 10^12.
// https://docs.arc.io/arc/references/usdc-system-events.md

/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

export type ReceiptLog = { address: string; topics: readonly string[]; data: string }
export type UsdcTransfer = { from: `0x${string}`; to: `0x${string}`; value: bigint }

function topicAddress(topic: string | undefined): `0x${string}` | null {
  if (typeof topic !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null
  const address = `0x${topic.slice(26)}`
  return isEvmAddress(address) ? (address.toLowerCase() as `0x${string}`) : null
}

/** USDC Transfer events emitted by the ERC-20 contract only (addresses lowercased, 6-decimal values). */
export function usdcTransfersFromLogs(logs: readonly ReceiptLog[], usdc: string = ARC_USDC_ADDRESS): UsdcTransfer[] {
  const emitter = usdc.toLowerCase()
  const transfers: UsdcTransfer[] = []
  for (const log of logs) {
    if (typeof log?.address !== "string" || log.address.toLowerCase() !== emitter) continue
    if (!Array.isArray(log.topics) || log.topics.length !== 3 || String(log.topics[0]).toLowerCase() !== TRANSFER_TOPIC) continue
    const from = topicAddress(log.topics[1])
    const to = topicAddress(log.topics[2])
    if (!from || !to || typeof log.data !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(log.data)) continue
    transfers.push({ from, to, value: BigInt(log.data) })
  }
  return transfers
}

/**
 * The USDC payment in a receipt from `from` (optional) to `to` of at least `minAmount`, or null.
 * A reverted transaction never counts.
 */
export function findUsdcPayment(
  receipt: { status: string; logs: readonly ReceiptLog[] },
  expected: { to: string; from?: string; minAmount: bigint; usdc?: string },
): UsdcTransfer | null {
  if (receipt.status !== "success") return null
  const to = expected.to.toLowerCase()
  const from = expected.from?.toLowerCase()
  return usdcTransfersFromLogs(receipt.logs, expected.usdc).find((transfer) =>
    transfer.to === to && (!from || transfer.from === from) && transfer.value >= expected.minAmount,
  ) ?? null
}
