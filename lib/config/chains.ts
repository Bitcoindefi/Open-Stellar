// Public chain surface. Agentic City is Solana-first: x402 payments and 8004 agent
// identity run on Solana devnet. The older Stellar (Freighter, Soroban, XLM) UI is
// kept in the codebase but hidden from end users unless explicitly turned back on.
//
// Turn it on with NEXT_PUBLIC_ENABLE_STELLAR=true (build-time, inlined by Next.js).
// API routes under /api/stellar/* and the lib/stellar* modules are not affected.

const TRUTHY = new Set(["1", "true", "yes", "on"])

export function parseFeatureFlag(value: string | undefined | null): boolean {
  if (typeof value !== "string") return false
  return TRUTHY.has(value.trim().toLowerCase())
}

// Must reference process.env.NEXT_PUBLIC_ENABLE_STELLAR literally so Next.js inlines it
// into client bundles.
export const STELLAR_ENABLED: boolean = parseFeatureFlag(process.env.NEXT_PUBLIC_ENABLE_STELLAR)

export type PaymentAsset = "USDC" | "XLM"

export function paymentAssetFor(stellarEnabled: boolean): PaymentAsset {
  return stellarEnabled ? "XLM" : "USDC"
}

// Asset label shown next to prices and rewards in the public UI.
export const PAYMENT_ASSET: PaymentAsset = paymentAssetFor(STELLAR_ENABLED)

export function formatAssetAmount(
  amount: number | string,
  options: { digits?: number; asset?: PaymentAsset } = {},
): string {
  const asset = options.asset ?? PAYMENT_ASSET
  const numeric = typeof amount === "number" ? amount : Number(amount)
  const value = Number.isFinite(numeric) && options.digits !== undefined ? numeric.toFixed(options.digits) : String(amount)
  return `${value} ${asset}`
}

// Network label for the public payment rail.
export function publicNetworkLabel(stellarEnabled: boolean = STELLAR_ENABLED): string {
  return stellarEnabled ? "Stellar testnet" : "Solana devnet"
}
