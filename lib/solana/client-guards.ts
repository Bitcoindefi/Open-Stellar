import { getCompiledTransactionMessageDecoder, getTransactionDecoder } from "@solana/kit"
import {
  AGENT_TASK_PRICE_BASE_UNITS,
  COMPUTE_BUDGET_PROGRAM,
  DEVNET_REGISTRY_PROGRAM,
  SOLANA_DEVNET_NETWORK,
  USDC_DEVNET_MINT,
} from "@/lib/solana/payment-constants"

// Checks the browser runs before the wallet signs anything the server prepared or asked for.
// The server is trusted to build these, but a compromised or buggy server should not be able
// to make the wallet sign an arbitrary transaction or an arbitrary payment.

export type TreasuryKeys = { feePayer: string | null; payTo: string | null }

type PaymentRequirementLike = { scheme?: string; network?: string; asset?: string; amount?: string; payTo?: string }

/** True when an x402 requirement is the agent task price, in devnet USDC, to the treasury. */
export function isExpectedAgentPayment(requirement: PaymentRequirementLike, expectedPayTo: string | null): boolean {
  if (!expectedPayTo) return false
  if (requirement.scheme !== "exact" || requirement.network !== SOLANA_DEVNET_NETWORK) return false
  if (requirement.asset !== USDC_DEVNET_MINT || requirement.payTo !== expectedPayTo) return false
  try {
    const amount = BigInt(requirement.amount ?? "")
    return amount > BigInt(0) && amount <= AGENT_TASK_PRICE_BASE_UNITS
  } catch {
    return false
  }
}

/**
 * Returns why the server-built review transaction must not be signed, or null when it only
 * runs the 8004 registry (plus a compute budget) with the treasury paying the fee.
 */
export function reviewTransactionProblem(bytes: Uint8Array, expectedFeePayer: string | null): string | null {
  if (!expectedFeePayer) return "unknown fee payer"
  let staticAccounts: readonly string[]
  let instructions: ReadonlyArray<{ programAddressIndex: number }>
  try {
    const transaction = getTransactionDecoder().decode(bytes)
    const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes)
    staticAccounts = message.staticAccounts
    instructions = message.instructions
  } catch {
    return "the transaction could not be decoded"
  }
  if (staticAccounts[0] !== expectedFeePayer) return "unexpected fee payer"
  if (instructions.length === 0) return "empty transaction"
  for (const instruction of instructions) {
    const program = staticAccounts[instruction.programAddressIndex]
    if (program !== DEVNET_REGISTRY_PROGRAM && program !== COMPUTE_BUDGET_PROGRAM) return `unexpected program ${String(program)}`
  }
  return null
}
