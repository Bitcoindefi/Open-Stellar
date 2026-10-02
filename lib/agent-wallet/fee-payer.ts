import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit"

// The server keypair (SOLANA_SERVER_SECRET, the devnet treasury that already pays 8004
// registrations) as a fee payer for withdrawals from agents' wallets. It only ever signs as
// fee payer here; it never authorizes moving tokens.

/** Parses a JSON array secret key (64 bytes, the solana-keygen format). Null when missing or malformed. */
export function parseSecretKey(raw: string | undefined): Uint8Array | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length !== 64) return null
    if (!parsed.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return null
    return Uint8Array.from(parsed as number[])
  } catch {
    return null
  }
}

export async function getFeePayerSigner(env: Record<string, string | undefined> = process.env): Promise<KeyPairSigner | null> {
  const bytes = parseSecretKey(env.SOLANA_SERVER_SECRET)
  if (!bytes) return null
  try {
    return await createKeyPairSignerFromBytes(bytes)
  } catch {
    return null
  }
}
