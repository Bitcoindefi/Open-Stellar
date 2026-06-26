import { getX402Receipt, listX402Receipts, saveX402Receipt, type X402ReceiptQuery } from '@/lib/protocols/x402-receipt-store'

export type SettlementChain = 'bnb' | 'stellar'

export interface X402QuoteRequest {
  serviceId: string
  chain: SettlementChain
  payer: string
  units: number
  unitPriceUsd: number
  ttlSeconds?: number
}

export interface X402Quote {
  code: 402
  serviceId: string
  chain: SettlementChain
  payer: string
  amountUsd: number
  amountUnits: string
  expiresAt: string
  paymentRef: string
  memo: string
}

export interface X402Settlement {
  paymentRef: string
  chain: SettlementChain
  txHash: string
  paidBy: string
}

export interface X402Receipt {
  accepted: boolean
  paymentRef: string
  settledAt: string
  txHash: string
  chain: SettlementChain
  amountUsd?: number
  amountUnits?: string
}

export interface X402ExplorerReceipt extends X402Receipt {
  id: string
  agentId: string
  service: string
  amount: string
  serviceId: string
  agent: string
  amountUsd: number
  amountUnits: string
  passportVerified: boolean
  reputationTier: string
}

const CHAIN_DECIMALS: Record<SettlementChain, number> = {
  bnb: 18,
  stellar: 7,
}

function parseUnits(value: number, decimals: number) {
  const fixed = value.toFixed(decimals)
  return fixed.replace('.', '')
}

type QuoteRegistry = Map<string, X402Quote>
const globalState = globalThis as typeof globalThis & {
  __x402QuoteRegistry__?: QuoteRegistry
}

const quoteRegistry: QuoteRegistry = globalState.__x402QuoteRegistry__ ?? new Map()
if (!globalState.__x402QuoteRegistry__) {
  globalState.__x402QuoteRegistry__ = quoteRegistry
}


export interface X402SettlementResult {
  ok: boolean
  receipt?: X402Receipt
  error?: string
}

export function peekX402Quote(paymentRef: string): X402Quote | undefined {
  return quoteRegistry.get(paymentRef)
}

export function createX402Quote(input: X402QuoteRequest): X402Quote {
  const ttlSeconds = input.ttlSeconds ?? 300
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('ttlSeconds must be > 0')
  }

  if (!Number.isFinite(input.units) || input.units <= 0) {
    throw new Error('units must be > 0')
  }

  if (!Number.isFinite(input.unitPriceUsd) || input.unitPriceUsd <= 0) {
    throw new Error('unitPriceUsd must be > 0')
  }

  const amountUsd = Number((input.units * input.unitPriceUsd).toFixed(6))
  const amountUnits = parseUnits(amountUsd, CHAIN_DECIMALS[input.chain])
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()
  const paymentRef = `${input.serviceId}:${input.chain}:${Date.now()}`

  const quote: X402Quote = {
    code: 402,
    serviceId: input.serviceId,
    chain: input.chain,
    payer: input.payer,
    amountUsd,
    amountUnits,
    expiresAt,
    paymentRef,
    memo: `x402/${input.serviceId}/${input.chain}`,
  }

  quoteRegistry.set(paymentRef, quote)
  return quote
}

export function verifyX402Settlement(input: X402Settlement): X402Receipt {
  const txLooksValid = /^0x[a-fA-F0-9]{64}$/.test(input.txHash) || /^[a-fA-F0-9]{64}$/.test(input.txHash)

  return {
    accepted: txLooksValid,
    paymentRef: input.paymentRef,
    settledAt: new Date().toISOString(),
    txHash: input.txHash,
    chain: input.chain,
  }
}

export function listX402ExplorerReceipts(filters: X402ReceiptQuery = {}) {
  return listX402Receipts(filters)
}

export function getX402ReceiptById(receiptId: string): X402ExplorerReceipt | undefined {
  return getX402Receipt(receiptId)
}

export function settleX402(input: X402Settlement): X402SettlementResult {
  const quote = quoteRegistry.get(input.paymentRef)
  if (!quote) {
    return { ok: false, error: 'Quote not found for paymentRef' }
  }

  if (quote.chain !== input.chain) {
    return { ok: false, error: 'Settlement chain does not match quote chain' }
  }

  const isExpired = Date.now() > new Date(quote.expiresAt).getTime()
  if (isExpired) {
    quoteRegistry.delete(input.paymentRef)
    return { ok: false, error: 'Quote expired' }
  }

  if (input.paidBy !== quote.payer) {
    return { ok: false, error: 'paidBy does not match quote payer' }
  }

  const receipt = verifyX402Settlement(input)
  if (!receipt.accepted) {
    return { ok: false, error: 'Invalid tx hash format' }
  }

  receipt.amountUsd = quote.amountUsd
  receipt.amountUnits = quote.amountUnits

  const storedReceipt = saveX402Receipt({
    ...receipt,
    id: `rcpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    agentId: quote.payer,
    service: quote.serviceId,
    amount: `${quote.amountUsd} USD`,
    serviceId: quote.serviceId,
    agent: quote.payer,
    amountUsd: quote.amountUsd,
    amountUnits: quote.amountUnits,
    passportVerified: true,
    reputationTier: quote.amountUsd >= 1 ? 'gold' : 'standard',
  })

  quoteRegistry.delete(input.paymentRef)
  return { ok: true, receipt: storedReceipt }
}

