import { defineChain, type Chain } from "viem"

// Arc testnet constants (Circle's EVM L1 where USDC is the gas token). Client-safe: no
// server-only imports, so the wallet tab and the explorer can use them.
//
// Sources (mirrored in docs/arc of the Open-Stellar workspace):
// - chain id, RPC and explorer: https://docs.arc.io/arc/references/rpc-endpoints.md
// - USDC address and decimals: https://docs.arc.io/arc/references/contract-addresses.md
// - duplicated Transfer event from the system emitter: https://docs.arc.io/arc/references/usdc-system-events.md
// - facilitator: https://developers.circle.com/facilitator-service/quickstart.md
//
// Testnet only on purpose: there is no switch to mainnet here.

export const ARC_TESTNET_CHAIN_ID = 5042002
export const ARC_TESTNET_CAIP2 = "eip155:5042002"
/** The network value stored on receipts made on Arc testnet. */
export const ARC_RECEIPT_NETWORK = "arc-testnet"
export const ARC_NETWORK_LABEL = "Arc testnet"

/** USDC on Arc: the ERC-20 interface (6 decimals) over the native gas balance (18 decimals). */
export const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000"
export const ARC_USDC_DECIMALS = 6
/** Emits a second Transfer for every USDC move, in 18 decimals. Never count it. */
export const ARC_SYSTEM_EMITTER = "0xfffffffffffffffffffffffffffffffffffffffe"

export const ARC_DEFAULT_RPC_URL = "https://rpc.testnet.arc.io"
export const ARC_DEFAULT_EXPLORER_URL = "https://explorer.testnet.arc.io"
export const ARC_FACILITATOR_URL = "https://api.circle.com/v1/facilitator/x402"
export const ARC_FAUCET_URL = "https://faucet.circle.com"

/** Default top-up from the person's wallet (0.10 USDC) and the most the panel offers (10 USDC). */
export const ARC_FUND_AMOUNT_MICRO = BigInt(100_000)
export const ARC_MAX_FUND_AMOUNT_MICRO = BigInt(10_000_000)

/** USDC kept in the agents' wallet on a withdrawal to pay the transfer's own gas (paid in USDC). */
export const ARC_WITHDRAW_GAS_RESERVE_MICRO = BigInt(10_000)

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
const EVM_TX_HASH = /^0x[0-9a-fA-F]{64}$/

export function isEvmAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && EVM_ADDRESS.test(value)
}

export function isEvmTxHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && EVM_TX_HASH.test(value)
}

export function sameEvmAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return isEvmAddress(a) && isEvmAddress(b) && a.toLowerCase() === b.toLowerCase()
}

function cleanUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed && /^https?:\/\//.test(trimmed) ? trimmed.replace(/\/+$/, "") : fallback
}

/** RPC for server code: ARC_RPC_URL, then NEXT_PUBLIC_ARC_RPC_URL, then the public endpoint. */
export function arcRpcUrl(env: Record<string, string | undefined> = process.env): string {
  return cleanUrl(env.ARC_RPC_URL || env.NEXT_PUBLIC_ARC_RPC_URL, ARC_DEFAULT_RPC_URL)
}

// Literal references so Next.js inlines them into client bundles.
const PUBLIC_RPC_URL = cleanUrl(process.env.NEXT_PUBLIC_ARC_RPC_URL, ARC_DEFAULT_RPC_URL)
const PUBLIC_EXPLORER_URL = cleanUrl(process.env.NEXT_PUBLIC_ARC_EXPLORER_URL, ARC_DEFAULT_EXPLORER_URL)

export function arcExplorerTxUrl(hash: string): string {
  return `${PUBLIC_EXPLORER_URL}/tx/${encodeURIComponent(hash)}`
}

export function arcExplorerAddressUrl(address: string): string {
  return `${PUBLIC_EXPLORER_URL}/address/${encodeURIComponent(address)}`
}

/**
 * The Arc testnet chain for viem and wagmi, built from the documented endpoints rather than
 * viem's bundled `arcTestnet` (older viem releases shipped retired RPC and explorer hosts).
 */
export function arcTestnetChain(rpcUrl: string = PUBLIC_RPC_URL): Chain {
  return defineChain({
    id: ARC_TESTNET_CHAIN_ID,
    name: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "Arc Explorer", url: PUBLIC_EXPLORER_URL } },
    testnet: true,
  })
}
