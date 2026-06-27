import type { SettlementChain, X402Quote, X402Receipt } from "@/lib/protocols/x402"

export function createMockX402Quote(input: {
  serviceId: string
  chain: SettlementChain
  payer: string
  units: number
  unitPriceUsd: number
  ttlSeconds?: number
}): X402Quote & { mock: true } {
  const ttlSeconds = input.ttlSeconds ?? 300
  const amountUsd = Number((input.units * input.unitPriceUsd).toFixed(6))
  const paymentRef = `mock:${input.serviceId}:${input.chain}:${Date.now()}`
  const option = { chain: input.chain, amount: `${amountUsd} MOCK`, amountUnits: String(Math.round(amountUsd * 10_000_000)), address: 'mock-address' }

  return {
    code: 402,
    quoteId: paymentRef,
    service: input.serviceId,
    serviceId: input.serviceId,
    chain: input.chain,
    payer: input.payer,
    amountUsd,
    amountUnits: option.amountUnits,
    address: option.address,
    options: [option],
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    paymentRef,
    memo: `mock-x402/${input.serviceId}/${input.chain}`,
    mock: true,
  }
}

export function settleMockX402(input: {
  paymentRef: string
  chain: SettlementChain
  txHash?: string
}): X402Receipt & { mock: true } {
  return {
    accepted: true,
    paymentRef: input.paymentRef || `mock:settle:${Date.now()}`,
    settledAt: new Date().toISOString(),
    txHash: input.txHash || `MOCK_X402_TX_${Date.now()}`,
    chain: input.chain,
    mock: true,
  }
}

