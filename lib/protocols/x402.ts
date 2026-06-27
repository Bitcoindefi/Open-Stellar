import { StrKey } from '@stellar/stellar-sdk'
import { verifyEvmPayment, type EvmSettlementChain } from '@/lib/evm-utils'

import { getX402Receipt, listX402Receipts, saveX402Receipt, type X402ReceiptQuery } from '@/lib/protocols/x402-receipt-store'
import type { ReputationAttestation, ReputationGateRequirement } from '@/lib/reputation/attestation'
import { checkReputationGate } from '@/lib/reputation/attestation'

export type SettlementChain = 'bnb' | 'base' | 'stellar'

type ChainAsset = 'XLM' | 'BNB' | 'ETH'

export interface X402QuoteRequest {
  serviceId: string
  chain?: SettlementChain
  payer: string
  units: number
  unitPriceUsd: number
  ttlSeconds?: number
  reputationGate?: ReputationGateRequirement
  attestation?: ReputationAttestation
}

export interface X402QuoteOption {
  chain: SettlementChain
  amount: string
  amountUnits: string
  address: string
}

export interface X402Quote {
  code: 402
  quoteId: string
  service: string
  serviceId: string
  chain: SettlementChain
  payer: string
  amountUsd: number
  amountUnits: string
  address: string
  options: X402QuoteOption[]
  expiresAt: string
  paymentRef: string
  memo: string
}

export interface X402Settlement {
  quoteId?: string
  paymentRef?: string
  chain: SettlementChain
  txHash: string
  paidBy?: string
  agentId?: string
}

export interface X402Receipt {
  accepted: boolean
  quoteId?: string
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

const CHAIN_DECIMALS: Record<SettlementChain, number> = { bnb: 18, base: 18, stellar: 7 }
const CHAIN_ASSET: Record<SettlementChain, ChainAsset> = { bnb: 'BNB', base: 'ETH', stellar: 'XLM' }
const FALLBACK_USD: Record<SettlementChain, number> = { stellar: 0.1, bnb: 550, base: 3000 }
const COINGECKO_IDS: Record<SettlementChain, string> = { stellar: 'stellar', bnb: 'binancecoin', base: 'ethereum' }
const DEFAULT_ADDRESSES: Record<SettlementChain, string> = {
  stellar: process.env.X402_STELLAR_ADDRESS || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  bnb: process.env.X402_BNB_ADDRESS || process.env.X402_EVM_ADDRESS || '0x0000000000000000000000000000000000000000',
  base: process.env.X402_BASE_ADDRESS || process.env.X402_EVM_ADDRESS || '0x0000000000000000000000000000000000000000',
}

let cachedRates: { rates: Record<SettlementChain, number>; expiresAt: number } | null = null

function parseUnits(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals)
  return fixed.replace('.', '').replace(/^0+(?=\d)/, '')
}

function formatNativeAmount(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 8, minimumFractionDigits: 0, useGrouping: false })
}

type QuoteRegistry = Map<string, X402Quote>
const globalState = globalThis as typeof globalThis & {
  __x402QuoteRegistry__?: QuoteRegistry
  __x402SubscriptionRegistry__?: SubscriptionRegistry
}

const quoteRegistry: QuoteRegistry = globalState.__x402QuoteRegistry__ ?? new Map()
if (!globalState.__x402QuoteRegistry__) globalState.__x402QuoteRegistry__ = quoteRegistry
export interface X402SettlementResult { ok: boolean; receipt?: X402Receipt; error?: string }

export function peekX402Quote(paymentRef: string): X402Quote | undefined { return quoteRegistry.get(paymentRef) }

async function refreshNativeUsdRates(fetcher: typeof fetch = fetch): Promise<Record<SettlementChain, number>> {
  const now = Date.now()
  if (cachedRates && cachedRates.expiresAt > now) return cachedRates.rates

  try {
    const ids = Object.values(COINGECKO_IDS).join(',')
    const response = await fetcher(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { headers: { accept: 'application/json' }, next: { revalidate: 30 } })
    if (!response.ok) throw new Error('CoinGecko unavailable')
    const payload = await response.json() as Record<string, { usd?: number }>
    const rates = { ...FALLBACK_USD }
    for (const chain of Object.keys(COINGECKO_IDS) as SettlementChain[]) {
      const usd = Number(payload[COINGECKO_IDS[chain]]?.usd)
      if (Number.isFinite(usd) && usd > 0) {
        const fallback = FALLBACK_USD[chain]
        const deviation = Math.abs(usd - fallback) / fallback
        if (deviation <= 0.20) {
          rates[chain] = usd
        }
      }
    }
    cachedRates = { rates, expiresAt: now + 30_000 }
    return rates
  } catch {
    cachedRates = { rates: FALLBACK_USD, expiresAt: now + 30_000 }
    return FALLBACK_USD
  }
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

  const reputationGate = checkReputationGate(input.reputationGate, input.attestation)
  if (!reputationGate.ok) {
    throw new Error(reputationGate.error || 'Reputation too low for this service')
  }

  const amountUsd = Number((input.units * input.unitPriceUsd).toFixed(6))
  const rates = cachedRates?.rates ?? FALLBACK_USD
  void refreshNativeUsdRates()
  const options = (['stellar', 'bnb', 'base'] as SettlementChain[]).map((chain) => {
    const nativeAmount = amountUsd / rates[chain]
    return { chain, amount: `${formatNativeAmount(nativeAmount)} ${CHAIN_ASSET[chain]}`, amountUnits: parseUnits(nativeAmount, CHAIN_DECIMALS[chain]), address: DEFAULT_ADDRESSES[chain] }
  })
  const preferredChain = input.chain ?? 'bnb'
  const preferred = options.find((option) => option.chain === preferredChain) ?? options[0]
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()
  const quoteId = `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const paymentRef = `${input.serviceId}:${preferred.chain}:${Date.now()}`
  const quote: X402Quote = { code: 402, quoteId, service: input.serviceId, serviceId: input.serviceId, chain: preferred.chain, payer: input.payer, amountUsd, amountUnits: preferred.amountUnits, address: preferred.address, options, expiresAt, paymentRef, memo: `x402/${input.serviceId}/${quoteId}` }
  quoteRegistry.set(paymentRef, quote)
  quoteRegistry.set(quoteId, quote)
  return quote
}

export async function verifyX402Settlement(input: X402Settlement, quote?: X402Quote): Promise<X402Receipt> {
  const paymentRef = input.paymentRef || input.quoteId || ''
  const option = quote?.options.find((item) => item.chain === input.chain)
  if (input.chain === 'stellar') {
    const accepted = /^0x[a-fA-F0-9]{64}$/.test(input.txHash) || /^[a-fA-F0-9]{64}$/.test(input.txHash) || /^[A-Z0-9]{64}$/.test(input.txHash)
    return { accepted, quoteId: quote?.quoteId, paymentRef, settledAt: new Date().toISOString(), txHash: input.txHash, chain: input.chain }
  }

  if (!option) return { accepted: false, quoteId: quote?.quoteId, paymentRef, settledAt: new Date().toISOString(), txHash: input.txHash, chain: input.chain }
  try {
    const verified = await verifyEvmPayment({ chain: input.chain as EvmSettlementChain, txHash: input.txHash, expectedTo: option.address, expectedValueWei: option.amountUnits, expectedFrom: input.paidBy })
    return { accepted: verified.accepted, quoteId: quote?.quoteId, paymentRef, settledAt: new Date().toISOString(), txHash: input.txHash, chain: input.chain }
  } catch {
    return { accepted: false, quoteId: quote?.quoteId, paymentRef, settledAt: new Date().toISOString(), txHash: input.txHash, chain: input.chain }
  }
}

export function listX402ExplorerReceipts(filters: X402ReceiptQuery = {}) {
  return listX402Receipts(filters)
}

export function settleX402(input: X402Settlement): X402SettlementResult {
  const paymentRef = input.paymentRef || input.quoteId || ''
  const quote = quoteRegistry.get(paymentRef)
  if (!quote) return { ok: false, error: 'Quote not found for paymentRef' }

  const isQuoteIdSettlement = Boolean(input.quoteId) && !input.paymentRef
  if (!isQuoteIdSettlement && quote.chain !== input.chain) return { ok: false, error: 'Settlement chain does not match quote chain' }
  const option = quote.options.find((item) => item.chain === input.chain)
  if (!option) return { ok: false, error: 'Settlement chain is not available for quote' }

  const isExpired = Date.now() > new Date(quote.expiresAt).getTime()
  if (isExpired) {
    quoteRegistry.delete(paymentRef)
    quoteRegistry.delete(quote.quoteId)
    return { ok: false, error: 'Quote expired' }
  }

  const payer = input.paidBy || input.agentId || ''
  if (payer && quote.payer !== 'anonymous') {
    const isStellarPayer = input.chain === 'stellar' && StrKey.isValidEd25519PublicKey(payer)
    const isEvmPayer = input.chain !== 'stellar' && /^0x[a-fA-F0-9]{40}$/.test(payer)
    if (!isStellarPayer && !isEvmPayer && payer !== quote.payer) return { ok: false, error: 'paidBy does not match quote payer' }
  }

  const txLooksValid = input.chain === 'stellar' ? /^0x[a-fA-F0-9]{64}$/.test(input.txHash) || /^[a-fA-F0-9]{64}$/.test(input.txHash) || /^[A-Z0-9]{64}$/.test(input.txHash) : /^0x[a-fA-F0-9]{64}$/.test(input.txHash)
  const receipt: X402Receipt = { accepted: txLooksValid, quoteId: quote.quoteId, paymentRef, settledAt: new Date().toISOString(), txHash: input.txHash, chain: input.chain }
  if (!receipt.accepted) return { ok: false, error: 'Invalid tx hash format' }

  receipt.amountUsd = quote.amountUsd
  receipt.amountUnits = option.amountUnits

  const storedReceipt = saveX402Receipt({
    ...receipt,
    id: `rcpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    agentId: quote.payer,
    service: quote.serviceId,
    amount: `${quote.amountUsd} USD`,
    serviceId: quote.serviceId,
    agent: input.agentId || input.paidBy || quote.payer,
    amountUsd: quote.amountUsd,
    amountUnits: option.amountUnits,
    passportVerified: true,
    reputationTier: quote.amountUsd >= 1 ? 'gold' : 'standard',
  })

  quoteRegistry.delete(paymentRef)
  quoteRegistry.delete(quote.quoteId)
  return { ok: true, receipt: storedReceipt }
}

export type X402SubscriptionPlan = 'starter' | 'growth' | 'pro' | 'custom' | 'monthly'
export type X402SubscriptionStatus = 'active' | 'grace' | 'paused'

export interface X402SubscriptionRequest {
  serviceId: string
  agentId: string
  plan: X402SubscriptionPlan
  callsPerMonth?: number
  pricePerMonth?: string
  walletBalanceXlm?: number
  now?: Date
}

export interface X402Subscription {
  id: string
  serviceId: string
  agentId: string
  plan: X402SubscriptionPlan
  callsPerMonth: number | null
  callsUsed: number
  pricePerMonth: string
  status: X402SubscriptionStatus
  active: boolean
  createdAt: string
  renewsAt: string
  graceEndsAt?: string
  pausedAt?: string
  lastChargedAt: string
  billingEvents: X402SubscriptionBillingEvent[]
}

export interface X402SubscriptionBillingEvent {
  id: string
  type: 'initial_charge' | 'renewal' | 'renewal_failed'
  amount: string
  at: string
  note: string
}

export interface X402SubscriptionAccess {
  active: boolean
  callsRemaining: number | null
  renewsAt: string
  status: X402SubscriptionStatus | 'missing' | 'exhausted'
  graceEndsAt?: string
  subscription?: X402Subscription
}

const PLAN_DEFAULTS: Record<X402SubscriptionPlan, { pricePerMonth: string; callsPerMonth: number | null }> = {
  starter: { pricePerMonth: '1 XLM', callsPerMonth: 100 },
  growth: { pricePerMonth: '5 XLM', callsPerMonth: 1000 },
  pro: { pricePerMonth: '20 XLM', callsPerMonth: 10000 },
  custom: { pricePerMonth: 'Custom', callsPerMonth: null },
  monthly: { pricePerMonth: '5 XLM', callsPerMonth: 1000 },
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const BILLING_CYCLE_MS = 30 * MS_PER_DAY
const GRACE_PERIOD_MS = MS_PER_DAY

type SubscriptionRegistry = Map<string, X402Subscription>

const subscriptionRegistry: SubscriptionRegistry = globalState.__x402SubscriptionRegistry__ ?? new Map()
if (!globalState.__x402SubscriptionRegistry__) {
  globalState.__x402SubscriptionRegistry__ = subscriptionRegistry
}

function subscriptionKey(agentId: string, serviceId: string) {
  return `${agentId}:${serviceId}`
}

function parseXlmAmount(price: string) {
  const match = price.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*XLM$/i)
  return match ? Number(match[1]) : 0
}

function assertSubscriptionInput(serviceId: string, agentId: string) {
  if (!serviceId.trim()) throw new Error('serviceId is required')
  if (!agentId.trim()) throw new Error('agentId is required')
}

export function createX402Subscription(input: X402SubscriptionRequest): X402Subscription {
  const serviceId = input.serviceId.trim()
  const agentId = input.agentId.trim()
  assertSubscriptionInput(serviceId, agentId)

  const defaults = PLAN_DEFAULTS[input.plan] ?? PLAN_DEFAULTS.monthly
  const callsPerMonth = input.callsPerMonth ?? defaults.callsPerMonth
  if (callsPerMonth !== null && (!Number.isFinite(callsPerMonth) || callsPerMonth <= 0)) {
    throw new Error('callsPerMonth must be > 0')
  }

  const pricePerMonth = (input.pricePerMonth || defaults.pricePerMonth).trim()
  const requiredXlm = parseXlmAmount(pricePerMonth)
  if (requiredXlm > 0 && input.walletBalanceXlm !== undefined && input.walletBalanceXlm < requiredXlm) {
    throw new Error('insufficient wallet balance for first month')
  }

  const now = input.now ?? new Date()
  const chargedAt = now.toISOString()
  const subscription: X402Subscription = {
    id: `sub_${Date.now().toString(36)}_${subscriptionRegistry.size + 1}`,
    serviceId,
    agentId,
    plan: input.plan,
    callsPerMonth,
    callsUsed: 0,
    pricePerMonth,
    status: 'active',
    active: true,
    createdAt: chargedAt,
    renewsAt: new Date(now.getTime() + BILLING_CYCLE_MS).toISOString(),
    lastChargedAt: chargedAt,
    billingEvents: [{
      id: `bill_${Date.now().toString(36)}_1`,
      type: 'initial_charge',
      amount: pricePerMonth,
      at: chargedAt,
      note: 'First subscription month deducted from agent Stellar wallet',
    }],
  }

  subscriptionRegistry.set(subscriptionKey(agentId, serviceId), subscription)
  return subscription
}

export function renewX402Subscriptions(now: Date = new Date(), balances: Record<string, number> = {}) {
  const renewed: X402Subscription[] = []
  const paused: X402Subscription[] = []

  for (const subscription of subscriptionRegistry.values()) {
    if (now.getTime() < new Date(subscription.renewsAt).getTime()) continue

    const requiredXlm = parseXlmAmount(subscription.pricePerMonth)
    const balance = balances[subscription.agentId]
    if (requiredXlm > 0 && balance !== undefined && balance < requiredXlm) {
      subscription.status = now.getTime() <= new Date(subscription.renewsAt).getTime() + GRACE_PERIOD_MS ? 'grace' : 'paused'
      subscription.active = subscription.status === 'grace'
      subscription.graceEndsAt = new Date(new Date(subscription.renewsAt).getTime() + GRACE_PERIOD_MS).toISOString()
      if (subscription.status === 'paused') subscription.pausedAt = now.toISOString()
      subscription.billingEvents.unshift({
        id: `bill_${Date.now().toString(36)}_${subscription.billingEvents.length + 1}`,
        type: 'renewal_failed',
        amount: subscription.pricePerMonth,
        at: now.toISOString(),
        note: 'Insufficient Stellar wallet balance; subscription entered grace/paused state',
      })
      paused.push(subscription)
      continue
    }

    subscription.status = 'active'
    subscription.active = true
    subscription.callsUsed = 0
    subscription.renewsAt = new Date(now.getTime() + BILLING_CYCLE_MS).toISOString()
    subscription.lastChargedAt = now.toISOString()
    delete subscription.graceEndsAt
    delete subscription.pausedAt
    subscription.billingEvents.unshift({
      id: `bill_${Date.now().toString(36)}_${subscription.billingEvents.length + 1}`,
      type: 'renewal',
      amount: subscription.pricePerMonth,
      at: now.toISOString(),
      note: 'Monthly renewal deducted from agent Stellar wallet',
    })
    renewed.push(subscription)
  }

  return { renewed, paused }
}

export function checkX402Subscription(agentId: string, serviceId: string, options: { consumeCall?: boolean } = {}): X402SubscriptionAccess {
  const subscription = subscriptionRegistry.get(subscriptionKey(agentId.trim(), serviceId.trim()))
  if (!subscription) return { active: false, callsRemaining: 0, renewsAt: '', status: 'missing' }

  renewX402Subscriptions()
  if (!subscription.active) {
    return { active: false, callsRemaining: Math.max(0, (subscription.callsPerMonth ?? 0) - subscription.callsUsed), renewsAt: subscription.renewsAt, status: subscription.status, graceEndsAt: subscription.graceEndsAt, subscription }
  }

  const monthlyCallLimit = subscription.callsPerMonth
  const unlimited = monthlyCallLimit === null
  const callsRemaining = unlimited ? null : Math.max(0, monthlyCallLimit - subscription.callsUsed)
  if (callsRemaining === 0) {
    return { active: false, callsRemaining: 0, renewsAt: subscription.renewsAt, status: 'exhausted', subscription }
  }

  if (options.consumeCall && monthlyCallLimit !== null) subscription.callsUsed += 1
  return {
    active: true,
    callsRemaining: monthlyCallLimit === null ? null : Math.max(0, monthlyCallLimit - subscription.callsUsed),
    renewsAt: subscription.renewsAt,
    status: subscription.status,
    graceEndsAt: subscription.graceEndsAt,
    subscription,
  }
}

export function getX402SubscriptionById(subscriptionId: string): X402Subscription | undefined {
  const id = subscriptionId.trim()
  if (!id) return undefined
  return Array.from(subscriptionRegistry.values()).find((subscription) => subscription.id === id)
}

export function listX402Subscriptions() {
  const subscriptions = Array.from(subscriptionRegistry.values()).sort((a, b) => a.renewsAt.localeCompare(b.renewsAt))
  const active = subscriptions.filter((subscription) => subscription.active)
  const mrrXlm = active.reduce((sum, subscription) => sum + parseXlmAmount(subscription.pricePerMonth), 0)
  return {
    subscriptions,
    stats: {
      active: active.length,
      paused: subscriptions.filter((subscription) => subscription.status === 'paused').length,
      grace: subscriptions.filter((subscription) => subscription.status === 'grace').length,
      mrrXlm,
    },
  }
}

export function resetX402SubscriptionsForTests() {
  subscriptionRegistry.clear()
}
