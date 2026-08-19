import { randomBytes } from 'node:crypto'
import { StrKey } from '@stellar/stellar-sdk'
import { verifyEvmPayment, type EvmSettlementChain } from '@/lib/evm-utils'
import { verifyStellarPayment } from '@/lib/stellar-utils'
import { isMockMode } from '@/lib/mock/mock-mode'

import { listX402Receipts, saveX402Receipt, type X402ReceiptQuery } from '@/lib/protocols/x402-receipt-store'
import { getX402SubscriptionStore, resetX402SubscriptionStoreForTests, saveX402SubscriptionStore } from '@/lib/protocols/x402-subscription-store'
import { dispatchX402Webhooks } from '@/lib/protocols/x402-webhook-store'
import type { ReputationAttestation, ReputationGateRequirement } from '@/lib/reputation/attestation'
import { checkReputationGate } from '@/lib/reputation/attestation'

export type SettlementChain = 'bnb' | 'base' | 'stellar'

const EXPLORER_MAINNET: Record<SettlementChain, string> = {
  bnb: 'https://bscscan.com/tx',
  base: 'https://basescan.org/tx',
  stellar: 'https://stellar.expert/explorer/mainnet/tx',
}

const EXPLORER_TESTNET: Record<SettlementChain, string> = {
  bnb: 'https://testnet.bscscan.com/tx',
  base: 'https://sepolia.basescan.org/tx',
  stellar: 'https://stellar.expert/explorer/testnet/tx',
}

export function getExplorerUrl(chain: SettlementChain, txHash: string): string {
  const isProduction = process.env.NODE_ENV === 'production'
  const base = isProduction ? EXPLORER_MAINNET[chain] : EXPLORER_TESTNET[chain]
  return `${base}/${txHash}`
}

type _ChainAsset = 'XLM' | 'BNB' | 'ETH'

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
  paymentRef?: string
  quoteId?: string
  chain: SettlementChain
  txHash: string
  paidBy: string
  agentId?: string
  reputationGate?: ReputationGateRequirement
  attestation?: ReputationAttestation
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
  explorerUrl?: string
  consumed?: boolean
  consumedAt?: string
  serviceId?: string
  service?: string
  id?: string
}

export interface X402ExplorerReceipt extends X402Receipt {
  id: string
  agent: string
  agentId: string
  service: string
  serviceId: string
  amount: string
  passportVerified: boolean
  reputationTier?: string
}

export interface X402SettlementResult {
  ok: boolean
  receipt?: X402Receipt
  error?: string
}

export type SubscriptionPlanId = 'tier-starter' | 'tier-pro' | 'tier-enterprise' | 'tier-custom'
export type X402SubscriptionStatus = 'active' | 'grace' | 'paused' | 'exhausted' | 'missing'

export interface X402SubscriptionBillingEvent {
  id: string
  type: 'initial_grant' | 'initial_charge' | 'renewal' | 'renewal_failed' | 'grace_start' | 'paused'
  amount: string
  at: string
  note?: string
}

export interface X402Subscription {
  id: string
  agentId: string
  serviceId: string
  planId?: SubscriptionPlanId
  plan?: string
  status: X402SubscriptionStatus
  pricePerMonth: string
  callsPerMonth: number | null
  callsUsed: number
  active: boolean
  renewsAt: string
  lastChargedAt?: string
  graceEndsAt?: string
  pausedAt?: string
  createdAt?: string
  billingEvents: X402SubscriptionBillingEvent[]
}

export interface X402SubscriptionAccess {
  active: boolean
  callsRemaining: number | null
  renewsAt: string
  status: X402SubscriptionStatus
  graceEndsAt?: string
  subscription?: X402Subscription
}

const FALLBACK_USD: Record<SettlementChain, number> = {
  stellar: 0.12,
  bnb: 600,
  base: 3000,
}

const CHAIN_DECIMALS: Record<SettlementChain, number> = {
  stellar: 7,
  bnb: 18,
  base: 18,
}

const CHAIN_ASSET: Record<SettlementChain, string> = {
  stellar: 'XLM',
  bnb: 'BNB',
  base: 'ETH',
}

const DEFAULT_ADDRESSES: Record<SettlementChain, string> = {
  stellar: process.env.STELLAR_TREASURY_ADDRESS || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  bnb: process.env.EVM_TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000',
  base: process.env.EVM_TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000',
}

const globalStore = globalThis as typeof globalThis & {
  __x402QuoteRegistry__?: Map<string, X402Quote>
  __x402SubscriptionRegistry__?: Map<string, X402Subscription>
  __x402RatesCache__?: { rates: Record<SettlementChain, number>; at: number }
}

const quoteRegistry = (globalStore.__x402QuoteRegistry__ ??= new Map<string, X402Quote>())
const subscriptionRegistry = (globalStore.__x402SubscriptionRegistry__ ??= new Map<string, X402Subscription>())

function formatNativeAmount(value: number): string {
  if (value < 0.000001) return value.toExponential(4)
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

function parseUnits(amount: number, decimals: number): string {
  const factor = Math.pow(10, decimals)
  return BigInt(Math.round(amount * factor)).toString()
}

function generateSecureRandomSuffix(): string {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(4)
    globalThis.crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 5)
  }
  return randomBytes(4).toString('hex').slice(0, 5)
}

let cachedRates = globalStore.__x402RatesCache__

export async function refreshNativeUsdRates(): Promise<Record<SettlementChain, number>> {
  if (cachedRates && Date.now() - cachedRates.at < 60_000) {
    return cachedRates.rates
  }

  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=stellar,binancecoin,ethereum&vs_currencies=usd',
      { headers: { Accept: 'application/json' } }
    )
    if (res.ok) {
      const data = (await res.json()) as Record<string, { usd?: number }>
      const rates: Record<SettlementChain, number> = {
        stellar: data.stellar?.usd ?? FALLBACK_USD.stellar,
        bnb: data.binancecoin?.usd ?? FALLBACK_USD.bnb,
        base: data.ethereum?.usd ?? FALLBACK_USD.base,
      }
      cachedRates = { rates, at: Date.now() }
      globalStore.__x402RatesCache__ = cachedRates
      return rates
    }
  } catch {}

  cachedRates = { rates: FALLBACK_USD, at: Date.now() }
  globalStore.__x402RatesCache__ = cachedRates
  return FALLBACK_USD
}

export function createX402Quote(input: {
  serviceId: string
  chain?: SettlementChain
  payer: string
  units: number
  unitPriceUsd: number
  ttlSeconds?: number
  reputationGate?: ReputationGateRequirement
  attestation?: ReputationAttestation
}): X402Quote {
  const ttlSeconds = input.ttlSeconds ?? 300

  if (!input.serviceId || input.serviceId.trim().length === 0) {
    throw new Error('serviceId must not be empty')
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
  const quoteId = `q_${Date.now().toString(36)}_${generateSecureRandomSuffix()}`
  const paymentRef = `${input.serviceId}:${preferred.chain}:${Date.now()}`
  const quote: X402Quote = { code: 402, quoteId, service: input.serviceId, serviceId: input.serviceId, chain: preferred.chain, payer: input.payer, amountUsd, amountUnits: preferred.amountUnits, address: preferred.address, options, expiresAt, paymentRef, memo: `x402/${input.serviceId}/${quoteId}` }
  quoteRegistry.set(paymentRef, quote)
  quoteRegistry.set(quoteId, quote)
  return quote
}

export function peekX402Quote(refOrId: string): X402Quote | undefined {
  return quoteRegistry.get(refOrId)
}

export function getX402Quote(refOrId: string): X402Quote | undefined {
  return quoteRegistry.get(refOrId)
}

export async function verifyX402Settlement(input: X402Settlement, quote?: X402Quote): Promise<X402Receipt> {
  const paymentRef = input.paymentRef || input.quoteId || ''
  const option = quote?.options.find((item) => item.chain === input.chain)
  const isMock =
    isMockMode() ||
    process.env.NODE_ENV === 'test' ||
    process.env.PLAYWRIGHT === 'true'

  const explorerUrl = getExplorerUrl(input.chain, input.txHash)
  if (input.chain === 'stellar') {
    if (isMock) {
      const accepted = /^0x[a-fA-F0-9]{64}$/.test(input.txHash) || /^[a-fA-F0-9]{64}$/.test(input.txHash) || /^[A-Z0-9]{64}$/.test(input.txHash)
      return { accepted, quoteId: quote?.quoteId, paymentRef, settledAt: new Date().toISOString(), txHash: input.txHash, chain: input.chain, explorerUrl }
    }
    const verified = await verifyStellarPayment({
      txHash: input.txHash,
      expectedDestination: option?.address ?? '',
      expectedAmount: option?.amountUnits ?? '',
      expectedSource: input.paidBy,
    })
    return { accepted: verified.accepted, quoteId: quote?.quoteId, paymentRef, settledAt: new Date().toISOString(), txHash: input.txHash, chain: input.chain, explorerUrl }
  }

  if (!option) return { accepted: false, quoteId: quote?.quoteId, paymentRef, settledAt: new Date().toISOString(), txHash: input.txHash, chain: input.chain }

  if (isMock) {
    const accepted = /^0x[a-fA-F0-9]{64}$/.test(input.txHash) || /^0x[a-fA-F0-9]{40}$/.test(input.txHash) || input.txHash.length >= 10
    return { accepted, quoteId: quote?.quoteId, paymentRef, settledAt: new Date().toISOString(), txHash: input.txHash, chain: input.chain }
  }

  if (!option) return { accepted: false, quoteId: quote?.quoteId, paymentRef, settledAt: new Date().toISOString(), txHash: input.txHash, chain: input.chain, explorerUrl }
  try {
    const verified = await verifyEvmPayment({ chain: input.chain as EvmSettlementChain, txHash: input.txHash, expectedTo: option.address, expectedValueWei: option.amountUnits, expectedFrom: input.paidBy })
    return { accepted: verified.accepted, quoteId: quote?.quoteId, paymentRef, settledAt: new Date().toISOString(), txHash: input.txHash, chain: input.chain, explorerUrl }
  } catch {
    return { accepted: false, quoteId: quote?.quoteId, paymentRef, settledAt: new Date().toISOString(), txHash: input.txHash, chain: input.chain, explorerUrl }
  }
}

export function listX402ExplorerReceipts(filters: X402ReceiptQuery = {}) {
  return listX402Receipts(filters)
}

function validateSettlementPayer(input: X402Settlement, quote: X402Quote): string | null {
  const payer = input.paidBy || ''
  if (!payer || quote.payer === 'anonymous') return null
  const isStellarPayer = input.chain === 'stellar' && StrKey.isValidEd25519PublicKey(payer)
  const isEvmPayer = input.chain !== 'stellar' && /^0x[a-fA-F0-9]{40}$/.test(payer)
  if (!isStellarPayer && !isEvmPayer && payer !== quote.payer) {
    return 'paidBy does not match quote payer'
  }
  return null
}

export async function settleX402(input: X402Settlement): Promise<X402SettlementResult> {
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

  const payerError = validateSettlementPayer(input, quote)
  if (payerError) return { ok: false, error: payerError }

  const verification = await verifyX402Settlement(input, quote)
  if (!verification.accepted) return { ok: false, error: 'Invalid tx hash format or verification failed' }

  const receipt: X402Receipt = { accepted: true, quoteId: quote.quoteId, paymentRef, settledAt: new Date().toISOString(), txHash: input.txHash, chain: input.chain }

  receipt.amountUsd = quote.amountUsd
  receipt.amountUnits = option.amountUnits
  receipt.explorerUrl = getExplorerUrl(input.chain, input.txHash)

  const storedReceipt = saveX402Receipt({
    ...receipt,
    id: `rcpt_${Date.now().toString(36)}_${generateSecureRandomSuffix()}`,
    agentId: quote.payer,
    service: quote.serviceId,
    amount: `${quote.amountUsd} USD`,
    serviceId: quote.serviceId,
    agent: input.paidBy || quote.payer,
    amountUsd: quote.amountUsd,
    amountUnits: option.amountUnits,
    passportVerified: true,
    reputationTier: quote.amountUsd >= 1 ? 'gold' : 'standard',
  })

  quoteRegistry.delete(paymentRef)
  quoteRegistry.delete(quote.quoteId)
  dispatchX402Webhooks(storedReceipt).catch((err: unknown) => {
    console.error('[x402] webhook dispatch error', err instanceof Error ? err.message : err)
  })

  return { ok: true, receipt: storedReceipt }
}

export type X402SubscriptionPlan = 'starter' | 'growth' | 'pro' | 'custom' | 'monthly'

export interface X402SubscriptionRequest {
  serviceId: string
  agentId: string
  plan: X402SubscriptionPlan
  callsPerMonth?: number
  pricePerMonth?: string
  walletBalanceXlm?: number
  now?: Date
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

function subscriptionKey(agentId: string, serviceId: string) {
  return `${agentId}:${serviceId}`
}

function parseXlmAmount(price: string) {
  const match = /^(\d+(?:\.\d+)?)\s*XLM$/i.exec(price.trim())
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
  saveX402SubscriptionStore(subscription)
  return subscription
}

export function renewX402Subscriptions(now: Date = new Date(), balances: Record<string, number> = {}) {
  const renewed: X402Subscription[] = []
  const paused: X402Subscription[] = []

  for (const subscription of subscriptionRegistry.values()) {
    if (now.getTime() < new Date(subscription.renewsAt).getTime()) continue

    const requiredXlm = parseXlmAmount(subscription.pricePerMonth)
    const balance = balances[subscription.agentId] ?? 0
    if (requiredXlm > 0 && balance < requiredXlm) {
      const graceEndTime = new Date(subscription.renewsAt).getTime() + GRACE_PERIOD_MS
      subscription.status = now.getTime() <= graceEndTime ? 'grace' : 'paused'
      subscription.active = subscription.status === 'grace'
      subscription.graceEndsAt = new Date(graceEndTime).toISOString()
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

  for (const sub of subscriptionRegistry.values()) {
    saveX402SubscriptionStore(sub)
  }

  return { renewed, paused }
}

export function checkX402Subscription(agentId: string, serviceId: string, options: { consumeCall?: boolean } = {}): X402SubscriptionAccess {
  const key = subscriptionKey(agentId.trim(), serviceId.trim())
  let subscription = subscriptionRegistry.get(key)
  if (!subscription) {
    const stored = getX402SubscriptionStore(agentId, serviceId)
    if (stored) {
      subscriptionRegistry.set(key, stored)
      subscription = stored
    }
  }

  if (!subscription) return { active: false, callsRemaining: 0, renewsAt: '', status: 'missing' }

  if (!subscription.active) {
    return { active: false, callsRemaining: Math.max(0, (subscription.callsPerMonth ?? 0) - subscription.callsUsed), renewsAt: subscription.renewsAt, status: subscription.status, graceEndsAt: subscription.graceEndsAt, subscription }
  }

  const monthlyCallLimit = subscription.callsPerMonth
  const unlimited = monthlyCallLimit === null
  const callsRemaining = unlimited ? null : Math.max(0, monthlyCallLimit - subscription.callsUsed)
  if (callsRemaining === 0) {
    return { active: false, callsRemaining: 0, renewsAt: subscription.renewsAt, status: 'exhausted', subscription }
  }

  if (options.consumeCall && monthlyCallLimit !== null) {
    subscription.callsUsed += 1
    saveX402SubscriptionStore(subscription)
  }
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
  resetX402SubscriptionStoreForTests()
}
