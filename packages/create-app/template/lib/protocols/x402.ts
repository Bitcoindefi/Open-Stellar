import { randomBytes } from 'node:crypto'

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

const quoteRegistry = new Map<string, X402Quote>()

export function peekX402Quote(paymentRef: string): X402Quote | undefined {
  return quoteRegistry.get(paymentRef)
}

export function createX402Quote(input: X402QuoteRequest): X402Quote {
  const ttlSeconds = input.ttlSeconds ?? 300
  const amountUsd = input.units * input.unitPriceUsd
  const paymentRef = `${input.serviceId}:${input.chain}:${cryptoRandomId()}`
  const quote: X402Quote = {
    code: 402,
    serviceId: input.serviceId,
    chain: input.chain,
    payer: input.payer,
    amountUsd,
    amountUnits: amountUsd.toFixed(7).replace('.', ''),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    paymentRef,
    memo: `x402:${input.serviceId}`,
  }

  quoteRegistry.set(paymentRef, quote)
  return quote
}

function cryptoRandomId(): string {
  return randomBytes(4).toString('hex')
}
