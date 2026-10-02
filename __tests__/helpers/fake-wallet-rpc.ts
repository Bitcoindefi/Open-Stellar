import { vi } from "vitest"
import type { WalletRpc } from "@/lib/agent-wallet/chain"
import { usdcAccountFor } from "@/lib/agent-wallet/fund-tx"

export const TEST_BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N"

/**
 * A fake devnet RPC for the agents' wallet code: USDC balances by wallet owner (null = no token
 * account), a fixed blockhash, and signature statuses that confirm after `confirmAfter` polls.
 */
export async function fakeWalletRpc(options: {
  balances?: Record<string, bigint | null>
  confirmAfter?: number
  statusError?: unknown
  failSend?: Error
  failRead?: Error
} = {}) {
  const accounts = new Map<string, bigint>()
  for (const [owner, amount] of Object.entries(options.balances ?? {})) {
    if (amount !== null) accounts.set(await usdcAccountFor(owner), amount)
  }
  const sent: string[] = []
  let polls = 0
  const rpc: WalletRpc = {
    getAccountInfo: vi.fn((account: string) => ({
      send: async () => {
        if (options.failRead) throw options.failRead
        const amount = accounts.get(account)
        return { value: amount === undefined ? null : { data: { parsed: { info: { tokenAmount: { amount: amount.toString() } } } } } }
      },
    })),
    getLatestBlockhash: vi.fn(() => ({ send: async () => ({ value: { blockhash: TEST_BLOCKHASH, lastValidBlockHeight: BigInt(1000) } }) })),
    sendTransaction: vi.fn((wire: string) => ({
      send: async () => {
        if (options.failSend) throw options.failSend
        sent.push(wire)
        return "sent"
      },
    })),
    getSignatureStatuses: vi.fn(() => ({
      send: async () => {
        polls += 1
        if (options.statusError) return { value: [{ confirmationStatus: "processed", err: options.statusError }] }
        return { value: [polls >= (options.confirmAfter ?? 1) ? { confirmationStatus: "confirmed", err: null } : null] }
      },
    })),
  }
  return { rpc, sent }
}
