import { describe, expect, it, vi } from 'vitest'
import { OpenStellarClient, createQuote, settlePayment, withX402, type X402Quote } from './index'

const quote: X402Quote = {
  code: 402,
  quoteId: 'q_1',
  service: 'svc',
  serviceId: 'svc',
  chain: 'stellar',
  payer: 'anonymous',
  amountUsd: 0.01,
  amountUnits: '1000000',
  address: 'GDEST',
  options: [{ chain: 'stellar', amount: '0.01 XLM', amountUnits: '1000000', address: 'GDEST' }],
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
  paymentRef: 'svc:stellar:1',
  memo: 'x402/svc/q_1',
}

function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init)
}

describe('@open-stellar/sdk', () => {
  it('creates quotes through the Open Stellar x402 API', async () => {
    const fetcher = vi.fn(async () => json({ ok: true, quote }))
    await expect(createQuote({ nodeUrl: 'https://node.example/', service: 'svc', price: '0.01 XLM', fetch: fetcher })).resolves.toMatchObject({ quoteId: 'q_1' })
    expect(fetcher).toHaveBeenCalledWith('https://node.example/api/protocol/x402/quote', expect.objectContaining({ method: 'POST' }))
  })

  it('settles payments through the Open Stellar x402 API', async () => {
    const receipt = { accepted: true, paymentRef: quote.paymentRef, settledAt: new Date().toISOString(), txHash: '0xabc', chain: 'stellar' as const }
    const fetcher = vi.fn(async () => json({ ok: true, receipt }))
    await expect(settlePayment({ nodeUrl: 'https://node.example', paymentRef: quote.paymentRef, chain: 'stellar', txHash: '0xabc', fetch: fetcher })).resolves.toEqual(receipt)
  })

  it('wraps a route with an x402 challenge and payment verification', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ ok: true, quote }))
      .mockResolvedValueOnce(json({ ok: true, receipt: { accepted: true, paymentRef: quote.paymentRef, settledAt: new Date().toISOString(), txHash: '0xabc', chain: 'stellar' } }))
    const handler = withX402({ price: '0.01 XLM', service: 'svc', fetch: fetcher })(async () => json({ data: 'premium' }))

    const challenge = await handler(new Request('https://api.example/premium'))
    expect(challenge.status).toBe(402)

    const paid = await handler(new Request('https://api.example/premium', { headers: { 'x402-payment': JSON.stringify({ paymentRef: quote.paymentRef, chain: 'stellar', txHash: '0xabc' }) } }))
    await expect(paid.json()).resolves.toEqual({ data: 'premium' })
  })

  it('pays and retries a gated request', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ quote }, { status: 402 }))
      .mockResolvedValueOnce(json({ ok: true, receipt: { accepted: true, paymentRef: quote.paymentRef, settledAt: new Date().toISOString(), txHash: '0xabc', chain: 'stellar' } }))
      .mockResolvedValueOnce(json({ data: 'premium' }))
    const client = new OpenStellarClient({ nodeUrl: 'https://node.example', fetch: fetcher })
    await expect(client.call('https://api.example/premium', { wallet: { payX402: async () => ({ txHash: '0xabc' }) }, maxPrice: '0.05 XLM' })).resolves.toEqual({ data: 'premium' })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})
