import { getKvStore } from "@/lib/security/kv-store"

// Links each settled x402 payment to the agent it paid for, so a review can only be left for
// that agent, and only once per payment.

// Reviews must use a payment from the last hour (see prepareFeedback), so a short TTL is enough.
export const PAYMENT_BINDING_TTL_SECONDS = 2 * 60 * 60
export const REVIEW_CLAIM_TTL_SECONDS = 7 * 24 * 60 * 60

const bindingKey = (signature: string) => `ac:x402:paid:${signature}`
const reviewKey = (signature: string) => `ac:8004:reviewed:${signature}`

/** Called by the task route after the payment settles. First writer wins. */
export async function recordAgentPayment(signature: string, agentKey: string): Promise<boolean> {
  if (!signature || !agentKey) return false
  return getKvStore().set(bindingKey(signature), agentKey, PAYMENT_BINDING_TTL_SECONDS, { onlyIfAbsent: true })
}

export async function getPaymentAgent(signature: string): Promise<string | null> {
  if (!signature) return null
  return getKvStore().get(bindingKey(signature))
}

/** Reserves the single review a payment allows. Returns false when it was already used. */
export async function claimPaymentReview(signature: string): Promise<boolean> {
  return getKvStore().set(reviewKey(signature), "1", REVIEW_CLAIM_TTL_SECONDS, { onlyIfAbsent: true })
}

/** Gives the review back when preparing it failed on our side. */
export async function releasePaymentReview(signature: string): Promise<void> {
  await getKvStore().del(reviewKey(signature))
}
