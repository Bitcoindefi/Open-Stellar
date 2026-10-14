import { x402Client, x402HTTPClient, type PaymentPolicy } from "@x402/fetch"
import { toClientEvmSigner } from "@x402/evm"
import { ExactEvmScheme } from "@x402/evm/exact/client"
import type { LocalAccount } from "viem/accounts"
import { ARC_TESTNET_CAIP2, ARC_USDC_ADDRESS, sameEvmAddress } from "@/lib/rails/arc/constants"
import type { PaidFetch } from "@/lib/orchestration/wallet"

// The buyer side of an Arc hire: the browser's Arc agents' wallet signs an EIP-3009 USDC
// authorization (off-chain, no gas) for the hired agent's x402 endpoint.
//
// Written out instead of @x402/fetch's wrapFetchWithPayment for one reason: when the seller
// answers 409 because Circle is still settling, this client sends the SAME signed payment again
// (same nonce, so the same payment-identifier) and never signs a new one, so a slow settlement
// cannot be charged twice.

/**
 * Only pays Arc testnet USDC, never more than `maxAtomic` per request, and (when given) only to
 * `payTo`. A server that asks for another network, token, amount or recipient gets nothing.
 */
export function arcUsdcPolicy(maxAtomic: bigint, payTo?: string | null): PaymentPolicy {
  return (_version, requirements) => requirements.filter((item) => {
    if (item.network !== ARC_TESTNET_CAIP2 || !sameEvmAddress(item.asset, ARC_USDC_ADDRESS)) return false
    if (payTo && !sameEvmAddress(item.payTo, payTo)) return false
    try {
      return BigInt(item.amount) <= maxAtomic
    } catch {
      return false
    }
  })
}

export function createArcPaidFetch(account: LocalAccount, options: {
  maxAtomic: bigint
  payTo?: string | null
  fetchImpl?: typeof fetch
  pendingRetries?: number
  pendingDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}): PaidFetch {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const client = new x402Client()
    .register(ARC_TESTNET_CAIP2, new ExactEvmScheme(toClientEvmSigner(account)))
    .registerPolicy(arcUsdcPolicy(options.maxAtomic, options.payTo))
  const http = new x402HTTPClient(client)

  return async (input, init = {}) => {
    const first = await fetchImpl(input, init)
    if (first.status !== 402) return first
    const body = await first.clone().json().catch(() => undefined)
    const required = http.getPaymentRequiredResponse((name) => first.headers.get(name), body)
    const payload = await http.createPaymentPayload(required)
    const headers = new Headers(init.headers)
    for (const [name, value] of Object.entries(http.encodePaymentSignatureHeader(payload))) headers.set(name, value)
    const send = () => fetchImpl(input, { ...init, headers })

    let response = await send()
    for (let attempt = 0; attempt < (options.pendingRetries ?? 3) && response.status === 409; attempt++) {
      const data = await response.clone().json().catch(() => null) as { pending?: unknown } | null
      if (data?.pending !== true) break
      await sleep(options.pendingDelayMs ?? 4_000)
      response = await send()
    }
    return response
  }
}
