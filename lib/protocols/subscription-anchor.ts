import { checkX402Subscription, getX402SubscriptionById } from '@/lib/protocols/x402'

export interface SubscriptionPaymentProof {
  subscriptionId: string
  isActive: boolean
  lastPaymentLedger: number | null
  lastPaymentTx: string
  contractId: string
}

export interface RecordSubscriptionPaymentInput {
  subscriptionId: string
  txHash: string
  ledger?: unknown
  contractId?: string
}

type SubscriptionProofRegistry = Map<string, SubscriptionPaymentProof>

const globalState = globalThis as typeof globalThis & {
  __x402SubscriptionProofRegistry__?: SubscriptionProofRegistry
}

const proofRegistry: SubscriptionProofRegistry = globalState.__x402SubscriptionProofRegistry__ ?? new Map()
if (!globalState.__x402SubscriptionProofRegistry__) {
  globalState.__x402SubscriptionProofRegistry__ = proofRegistry
}

export const SUBSCRIPTION_ANCHOR_CONTRACT_ID =
  process.env.NEXT_PUBLIC_STELLAR_SUBSCRIPTION_ANCHOR_CONTRACT_ID ||
  process.env.STELLAR_SUBSCRIPTION_ANCHOR_CONTRACT_ID ||
  'local-subscription-anchor'

function normalizeLedger(value: unknown): number | null {
  const ledger = Number(value)
  return Number.isFinite(ledger) && ledger > 0 ? Math.floor(ledger) : null
}

function currentSubscriptionActive(subscriptionId: string): boolean {
  const subscription = getX402SubscriptionById(subscriptionId)
  if (!subscription) return false
  return checkX402Subscription(subscription.agentId, subscription.serviceId).active
}

export const subscription_anchor = {
  record_payment(input: RecordSubscriptionPaymentInput): SubscriptionPaymentProof {
    const subscriptionId = input.subscriptionId.trim()
    if (!subscriptionId) {
      throw new Error('subscriptionId is required')
    }

    if (!getX402SubscriptionById(subscriptionId)) {
      throw new Error('Subscription not found')
    }

    const txHash = input.txHash.trim()
    if (!txHash) {
      throw new Error('txHash is required')
    }

    const proof: SubscriptionPaymentProof = {
      subscriptionId,
      isActive: currentSubscriptionActive(subscriptionId),
      lastPaymentLedger: normalizeLedger(input.ledger),
      lastPaymentTx: txHash,
      contractId: input.contractId?.trim() || SUBSCRIPTION_ANCHOR_CONTRACT_ID,
    }

    proofRegistry.set(subscriptionId, proof)
    return proof
  },
}

export function getSubscriptionPaymentProof(subscriptionId: string): SubscriptionPaymentProof | undefined {
  const proof = proofRegistry.get(subscriptionId.trim())
  if (!proof) return undefined

  return {
    ...proof,
    isActive: currentSubscriptionActive(proof.subscriptionId),
  }
}

export function resetSubscriptionPaymentProofsForTests(): void {
  proofRegistry.clear()
}
