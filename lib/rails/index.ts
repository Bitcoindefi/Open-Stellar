import { parseFeatureFlag } from "@/lib/config/chains"
import { RECEIPT_NETWORK, addressExplorerUrl, txExplorerUrl } from "@/lib/receipts/explorer-links"
import { SOLANA_DEVNET_NETWORK, USDC_DECIMALS, USDC_DEVNET_MINT } from "@/lib/solana/payment-constants"
import {
  ARC_NETWORK_LABEL,
  ARC_RECEIPT_NETWORK,
  ARC_TESTNET_CAIP2,
  ARC_USDC_ADDRESS,
  ARC_USDC_DECIMALS,
  arcExplorerAddressUrl,
  arcExplorerTxUrl,
  isEvmAddress,
  isEvmTxHash,
} from "@/lib/rails/arc/constants"

// Payment rails: the chain a payment, an agents' wallet and a receipt live on. Solana devnet is
// the default and behaves exactly as before; Arc testnet is opt-in, per browser, through the
// "Red de pago" selector in the Wallet tab, and only when NEXT_PUBLIC_ENABLE_ARC is on.
// Client-safe: only constants and pure helpers here (server code lives in lib/rails/arc/*).

export type RailId = "solana" | "arc"
export const RAIL_IDS: readonly RailId[] = ["solana", "arc"]
export const DEFAULT_RAIL: RailId = "solana"

export type RailInfo = {
  id: RailId
  /** CAIP-2 network of the x402 payments. */
  caip2: string
  /** The `network` stored on receipts. */
  receiptNetwork: string
  /** Human label, e.g. "Solana devnet". */
  label: string
  /** Short name for the selector. */
  shortName: string
  asset: string
  decimals: number
  explorerTx: (tx: string) => string
  explorerAddress: (address: string) => string
  isTxId: (value: unknown) => boolean
  isAddress: (value: unknown) => boolean
}

const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{32,100}$/
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export const SOLANA_RAIL: RailInfo = {
  id: "solana",
  caip2: SOLANA_DEVNET_NETWORK,
  receiptNetwork: RECEIPT_NETWORK,
  label: "Solana devnet",
  shortName: "Solana",
  asset: USDC_DEVNET_MINT,
  decimals: USDC_DECIMALS,
  explorerTx: txExplorerUrl,
  explorerAddress: addressExplorerUrl,
  isTxId: (value) => typeof value === "string" && BASE58_SIGNATURE.test(value),
  isAddress: (value) => typeof value === "string" && BASE58_ADDRESS.test(value),
}

export const ARC_RAIL: RailInfo = {
  id: "arc",
  caip2: ARC_TESTNET_CAIP2,
  receiptNetwork: ARC_RECEIPT_NETWORK,
  label: ARC_NETWORK_LABEL,
  shortName: "Arc",
  asset: ARC_USDC_ADDRESS,
  decimals: ARC_USDC_DECIMALS,
  explorerTx: arcExplorerTxUrl,
  explorerAddress: arcExplorerAddressUrl,
  isTxId: isEvmTxHash,
  isAddress: isEvmAddress,
}

export const RAILS: Record<RailId, RailInfo> = { solana: SOLANA_RAIL, arc: ARC_RAIL }

// Must reference process.env.NEXT_PUBLIC_ENABLE_ARC literally so Next.js inlines it into
// client bundles. Off by default: production keeps Solana only until the owner turns it on.
export const ARC_ENABLED: boolean = parseFeatureFlag(process.env.NEXT_PUBLIC_ENABLE_ARC)

/** Server-side check, read at request time (tests pass their own env). */
export function isArcEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return parseFeatureFlag(env.NEXT_PUBLIC_ENABLE_ARC)
}

export function isRailId(value: unknown): value is RailId {
  return value === "solana" || value === "arc"
}

export function railFor(id: RailId): RailInfo {
  return RAILS[id]
}

/** The rail of a receipt or settle `network` (CAIP-2 or receipt value). Unknown values are Solana. */
export function railForNetwork(network: string | null | undefined): RailInfo {
  if (network === ARC_RECEIPT_NETWORK || network === ARC_TESTNET_CAIP2) return ARC_RAIL
  return SOLANA_RAIL
}

export function networkLabel(network: string | null | undefined): string {
  return railForNetwork(network).label
}

export type RailRequest = { ok: true; rail: RailId } | { ok: false; error: string }

/**
 * Which rail a request asks for: `?network=arc` (or a body field the caller passes). Absent or
 * "solana" is Solana. Arc while the flag is off is refused, so production stays Solana-only.
 */
export function requestedRail(value: unknown, env: Record<string, string | undefined> = process.env): RailRequest {
  if (value === undefined || value === null || value === "" || value === "solana") return { ok: true, rail: "solana" }
  if (value === "arc") return isArcEnabled(env) ? { ok: true, rail: "arc" } : { ok: false, error: "Arc payments are not enabled on this server." }
  return { ok: false, error: "Unknown payment network." }
}

export function requestedRailFromUrl(url: string, env: Record<string, string | undefined> = process.env): RailRequest {
  return requestedRail(new URL(url).searchParams.get("network"), env)
}
