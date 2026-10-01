// Payment constants shared by the server (x402 route, review checks) and the browser
// (wallet guards). Kept free of server-only imports so client components can use them.

export const AGENT_TASK_PRICE = "$0.01"
/** Circle's devnet USDC, the asset x402 charges on solana-devnet. */
export const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
export const USDC_DECIMALS = 6
export const SOLANA_DEVNET_NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
export const DEVNET_REGISTRY_PROGRAM = "8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C"
export const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111"

/** "$0.01" -> 10000n for a 6-decimal token. Rejects anything that is not a plain dollar amount. */
export function usdPriceToBaseUnits(price: string, decimals: number = USDC_DECIMALS): bigint {
  const match = /^\$?(\d+)(?:\.(\d+))?$/.exec(price.trim())
  if (!match) throw new Error(`Invalid price: ${price}`)
  const fraction = match[2] ?? ""
  if (fraction.length > decimals) throw new Error(`Price ${price} has more than ${decimals} decimals`)
  // String arithmetic: the TS target predates bigint literals and `**` on bigint.
  return BigInt(`${match[1]}${fraction.padEnd(decimals, "0")}`)
}

export const AGENT_TASK_PRICE_BASE_UNITS: bigint = usdPriceToBaseUnits(AGENT_TASK_PRICE)
