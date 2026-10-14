// Solana devnet receipt network and explorer links. Client-safe (no server imports), so the rail
// registry (lib/rails) and the explorer page can use them; lib/receipts/log.ts re-exports them.

export const RECEIPT_NETWORK = "solana:devnet"

export function txExplorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`
}

export function addressExplorerUrl(address: string): string {
  return `https://explorer.solana.com/address/${encodeURIComponent(address)}?cluster=devnet`
}
