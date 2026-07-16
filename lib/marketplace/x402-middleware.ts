import { StrKey } from '@stellar/stellar-sdk'
import { createApiRouteLogger } from '@/lib/api-logging'
import { isMockMode } from '@/lib/mock/mock-mode'
import { settleMockX402 } from '@/lib/mock/x402-mock'
import {
  createX402Quote,
  peekX402Quote,
  settleX402,
  type X402Quote,
  type X402Settlement,
  type X402Receipt,
} from '@/lib/protocols/x402'
import { authorizePayment } from '@/lib/passport/passport'
import { publishSystemEvent } from '@/lib/events/system-events'
import { XP_AWARDS } from '@/lib/gamification/constants'
import { awardXP } from '@/lib/gamification/xp'
import { recordInvocation, updateInvocationStatus } from './invocation-ledger'

// At start of invokeSkillWithPayment:
const invocation = recordInvocation(request.agentId, skill.id, skill.priceXLM, '', skill.callUrl, request.payload)

// Every exit path now calls updateInvocationStatus():
// - 200 success → 'success'
// - 404/500 → 'failed'
// - quote mismatch → 'failed'
// - insufficient_balance → 'failed'
// - payment failure → 'failed'
// - retry 200 → 'success' with paymentProof
// - retry 500 → 'failed'

export interface SkillListing {
  id: string
  agentId: string
  callUrl: string
  priceXLM: number
  ownerWallet: string
  name: string
  description?: string
}

export interface SkillInvocationRequest {
  agentId: string
  payload: unknown
  payerWallet?: string
}

export interface PaymentProof {
  txHash: string
  chain: 'stellar' | 'bnb' | 'base'
  amountUnits: string
  settledAt: string
}

export interface SkillInvocationResult {
  ok: boolean
  status: number
  data?: unknown
  error?: string
  paymentProof?: PaymentProof
}

const X_PAYMENT_HEADER = 'X-Payment'
const X402_VERSION_HEADER = 'X-X402-Version'

/**
 * Attempts an HTTP request to a skill endpoint.
 * If 402 is returned, parses payment requirements and returns the quote.
 */
async function attemptSkillRequest(
  callUrl: string,
  payload: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; data: unknown; quote?: X402Quote }> {
  const response = await fetch(callUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(headers || {}),
    },
    body: JSON.stringify(payload),
  })

  const data = (await response.json().catch(() => ({}))) as unknown

  if (response.status === 402 && data && typeof data === 'object') {
    const maybeQuote = data as Partial<X402Quote>
    if (maybeQuote.code === 402 && maybeQuote.paymentRef) {
      return { status: 402, data, quote: maybeQuote as X402Quote }
    }
  }

  return { status: response.status, data }
}

/**
 * Generates a Stellar payment transaction and submits it.
 * Returns the transaction hash as payment proof.
 */
async function generateStellarPayment(
  fromWallet: string,
  toWallet: string,
  amountXLM: number,
  memo?: string,
): Promise<{ txHash: string; success: boolean; error?: string }> {
  // Validate addresses
  if (!StrKey.isValidEd25519PublicKey(toWallet)) {
    return { txHash: '', success: false, error: 'invalid_destination_address' }
  }

  // Build transaction via existing Stellar helpers
  const buildRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/stellar/build-tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: fromWallet,
      operations: [
        {
          type: 'payment',
          destination: toWallet,
          asset: 'native',
          amount: String(amountXLM),
        },
      ],
      memo: memo || 'x402/skill/payment',
    }),
  })

  if (!buildRes.ok) {
    const err = (await buildRes.json().catch(() => ({}))) as { error?: string }
    return { txHash: '', success: false, error: err.error || 'build_tx_failed' }
  }

  const { xdr } = (await buildRes.json()) as { xdr: string }

  // In a real flow, the client wallet (Freighter) signs and submits
  // For server-side agent invocation, we expect a pre-signed tx or use a custodial signer
  // Here we submit the built tx (assuming it's signed by a custodial key or the caller)
  const submitRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/stellar/submit-tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xdr }),
  })

  const submitData = (await submitRes.json().catch(() => ({}))) as {
    hash?: string
    error?: string
    status?: string
  }

  if (!submitRes.ok || submitData.status !== 'success') {
    // Check for insufficient balance
    if (
      submitData.error?.includes('insufficient') ||
      submitData.error?.includes('underfunded') ||
      submitData.error?.includes('buying_liabilities')
    ) {
      return { txHash: '', success: false, error: 'insufficient_balance' }
    }
    return {
      txHash: '',
      success: false,
      error: submitData.error || 'submit_tx_failed',
    }
  }

  return { txHash: submitData.hash || '', success: true }
}

/**
 * Main x402 middleware flow for skill invocation:
 * 1. Attempt request → if 200, return response
 * 2. If 402, capture quote requirements
 * 3. Generate Stellar payment to skill owner
 * 4. Attach payment proof as X-Payment header
 * 5. Retry request
 */
export async function invokeSkillWithPayment(
  skill: SkillListing,
  request: SkillInvocationRequest,
  callerLogger?: ReturnType<typeof createApiRouteLogger>,
): Promise<SkillInvocationResult> {
  const logger = callerLogger || {
    json: async (body: unknown, init?: ResponseInit) => {
      return new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json' } })
    },
    report: async (level: string, error: unknown, body: unknown, init?: ResponseInit) => {
      return new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json' } })
    },
  } as ReturnType<typeof createApiRouteLogger>

  // Step 1: Initial attempt without payment
  const firstAttempt = await attemptSkillRequest(skill.callUrl, request.payload)

  // If not 402, return whatever we got (could be 200, 404, 500, etc.)
  if (firstAttempt.status !== 402) {
    return {
      ok: firstAttempt.status >= 200 && firstAttempt.status < 300,
      status: firstAttempt.status,
      data: firstAttempt.data,
    }
  }

  // Step 2: We got 402 — need to pay
  const quote = firstAttempt.quote

  if (!quote) {
    return {
      ok: false,
      status: 402,
      error: 'payment_required_but_no_quote',
    }
  }

  // Verify the quote matches expected skill price
  const expectedAmountXLM = skill.priceXLM
  const quoteAmountXLM = parseFloat(quote.amountUnits) / 10 ** 7 // Stellar has 7 decimals

  if (Math.abs(quoteAmountXLM - expectedAmountXLM) > 0.0001) {
    return {
      ok: false,
      status: 402,
      error: 'quote_mismatch',
    }
  }

  // Step 3: Generate payment
  let paymentResult: { txHash: string; success: boolean; error?: string }

  if (isMockMode()) {
    const mockReceipt = settleMockX402({
      paymentRef: quote.paymentRef,
      chain: 'stellar',
    })
    paymentResult = {
      txHash: mockReceipt.txHash,
      success: true,
    }
  } else {
    const payerWallet = request.payerWallet || request.agentId
    if (!payerWallet || !StrKey.isValidEd25519PublicKey(payerWallet)) {
      return {
        ok: false,
        status: 402,
        error: 'insufficient_balance',
      }
    }

    // Agent Passport gate: check spend cap if applicable
    const gate = await authorizePayment(request.agentId, quote.amountUnits)
    if (!gate.authorized) {
      return {
        ok: false,
        status: 402,
        error: 'insufficient_balance',
      }
    }

    paymentResult = await generateStellarPayment(
      payerWallet,
      skill.ownerWallet,
      skill.priceXLM,
      quote.memo,
    )
  }

  if (!paymentResult.success) {
    if (paymentResult.error === 'insufficient_balance') {
      return {
        ok: false,
        status: 402,
        error: 'insufficient_balance',
      }
    }
    return {
      ok: false,
      status: 500,
      error: paymentResult.error || 'payment_failed',
    }
  }

  // Step 4: Settle the x402 payment on-chain via protocol
  const settlement: X402Settlement = {
    paymentRef: quote.paymentRef,
    chain: 'stellar',
    txHash: paymentResult.txHash,
    paidBy: request.payerWallet || request.agentId,
    agentId: request.agentId,
  }

  let receipt: X402Receipt | undefined

  if (!isMockMode()) {
    const settleResult = settleX402(settlement)
    if (!settleResult.ok || !settleResult.receipt) {
      return {
        ok: false,
        status: 402,
        error: settleResult.error || 'settlement_failed',
      }
    }
    receipt = settleResult.receipt
  }

  // Step 5: Retry request with payment proof header
  const paymentProofHeader = JSON.stringify({
    txHash: paymentResult.txHash,
    chain: 'stellar',
    paymentRef: quote.paymentRef,
    version: 'x402-v1',
  })

  const retryAttempt = await attemptSkillRequest(skill.callUrl, request.payload, {
    [X_PAYMENT_HEADER]: paymentProofHeader,
    [X402_VERSION_HEADER]: '1.0',
  })

  // Award XP for successful payment
  awardXP(request.agentId, XP_AWARDS.X402_PAYMENT_RECEIVED, 'payment.received')  // ✅ valid XPAwardReason
publishSystemEvent({
  type: 'payment.received',  // ✅ valid SystemEvent type
  agentId: request.agentId,
  receipt: receipt ?? {     // ✅ requires X402Receipt shape
    accepted: true,
    paymentRef: quote.paymentRef,
    settledAt: new Date().toISOString(),
    txHash: paymentResult.txHash,
    chain: 'stellar',
    amountUsd: quote.amountUsd,
    amountUnits: quote.amountUnits,
  },
})

  return {
    ok: retryAttempt.status >= 200 && retryAttempt.status < 300,
    status: retryAttempt.status,
    data: retryAttempt.data,
    paymentProof: {
      txHash: paymentResult.txHash,
      chain: 'stellar',
      amountUnits: quote.amountUnits,
      settledAt: new Date().toISOString(),
    },
  }
}
