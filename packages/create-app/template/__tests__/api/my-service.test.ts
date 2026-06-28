import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/my-service/route'
import { POST as postQuote } from '@/app/api/protocol/x402/quote/route'

describe('GET /api/my-service', () => {
  it('returns 402 without payment header', async () => {
    const res = await GET(new Request('http://localhost/api/my-service'))
    const data = await res.json()

    expect(res.status).toBe(402)
    expect(data.code).toBe(402)
    expect(data.serviceId).toBe('my-service')
  })

  it('returns service payload when payment ref is valid', async () => {
    const quoteReq = new Request('http://localhost/api/protocol/x402/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: 'my-service', chain: 'stellar', payer: 'agent-1' }),
    })
    const quoteRes = await postQuote(quoteReq)
    const quoteData = await quoteRes.json()

    const res = await GET(
      new Request('http://localhost/api/my-service', {
        headers: { 'x-payment-ref': quoteData.quote.paymentRef },
      }),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.service).toBe('my-service')
  })
})
