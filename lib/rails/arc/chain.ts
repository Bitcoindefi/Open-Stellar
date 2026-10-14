import { createPublicClient, createWalletClient, erc20Abi, http, type PublicClient } from "viem"
import type { LocalAccount } from "viem/accounts"
import { ARC_USDC_ADDRESS, ARC_WITHDRAW_GAS_RESERVE_MICRO, arcRpcUrl, arcTestnetChain, isEvmAddress, sameEvmAddress } from "@/lib/rails/arc/constants"
import { findUsdcPayment, type ReceiptLog } from "@/lib/rails/arc/receipt"

// Server-side chain reads and the withdrawal for the Arc agents' wallet. Amounts are always the
// ERC-20 view of USDC (6 decimals, bigint); the native 18-decimal balance is never read, so caps,
// balances and receipts cannot drift by 10^12. The agent pays its own withdrawal gas in USDC from
// the same balance, so a small reserve stays behind.

/** The few chain calls used here, so tests can fake them without an RPC. */
export type ArcChain = {
  usdcBalance: (owner: `0x${string}`) => Promise<bigint>
  transferUsdc: (account: LocalAccount, to: `0x${string}`, amount: bigint) => Promise<`0x${string}`>
  waitForReceipt: (hash: `0x${string}`) => Promise<{ status: string; logs: readonly ReceiptLog[] } | null>
}

export function createArcPublicClient(rpcUrl: string = arcRpcUrl()): PublicClient {
  return createPublicClient({ chain: arcTestnetChain(rpcUrl), transport: http(rpcUrl, { timeout: 20_000 }) })
}

export function createArcChain(rpcUrl: string = arcRpcUrl()): ArcChain {
  const chain = arcTestnetChain(rpcUrl)
  const publicClient = createArcPublicClient(rpcUrl)
  return {
    usdcBalance: (owner) => publicClient.readContract({ address: ARC_USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
    transferUsdc: (account, to, amount) => createWalletClient({ account, chain, transport: http(rpcUrl, { timeout: 20_000 }) })
      .writeContract({ address: ARC_USDC_ADDRESS, abi: erc20Abi, functionName: "transfer", args: [to, amount], chain, account }),
    waitForReceipt: async (hash) => {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 })
        return { status: receipt.status, logs: receipt.logs as readonly ReceiptLog[] }
      } catch {
        return null
      }
    },
  }
}

export type ArcWithdrawResult =
  | { ok: true; hash: `0x${string}`; amountMicro: bigint; confirmed: boolean }
  | { ok: false; status: number; error: string }

/** Moves the agents' wallet USDC, minus the gas reserve, to `destination`. */
export async function withdrawArcUsdc(input: {
  chain: ArcChain
  agent: LocalAccount
  destination: string
  reserveMicro?: bigint
}): Promise<ArcWithdrawResult> {
  if (!isEvmAddress(input.destination)) return { ok: false, status: 400, error: "Connect the wallet that should receive the USDC." }
  if (sameEvmAddress(input.destination, input.agent.address)) return { ok: false, status: 400, error: "Choose a wallet other than the agents' wallet." }
  const reserve = input.reserveMicro ?? ARC_WITHDRAW_GAS_RESERVE_MICRO
  const balance = await input.chain.usdcBalance(input.agent.address)
  const amount = balance - reserve
  if (amount <= BigInt(0)) return { ok: false, status: 409, error: "The agents' wallet has no USDC to withdraw beyond the gas reserve." }
  const destination = input.destination as `0x${string}`
  const hash = await input.chain.transferUsdc(input.agent, destination, amount)
  const receipt = await input.chain.waitForReceipt(hash)
  if (receipt && receipt.status !== "success") return { ok: false, status: 502, error: "The withdrawal failed on-chain." }
  const confirmed = Boolean(receipt && findUsdcPayment(receipt, { from: input.agent.address, to: destination, minAmount: amount }))
  return { ok: true, hash, amountMicro: amount, confirmed }
}
