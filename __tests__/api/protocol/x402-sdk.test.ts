import { describe, expect, it } from 'vitest'
import { withX402 } from '@/lib/sdk/x402'
import { createX402Subscription } from '@/lib/protocols/x402'
import { saveX402Receipt } from '@/lib/protocols/x402-receipt-store'

describe('x402 SDK (withX402 middleware)', () => {
  it('returns HTTP 402 with quote headers when no payment credentials are provided', async () => {
    const handler = withX402(
      { serviceId: 'oracle-service', unitPriceUsd: 0.1 },
      async () => Response.json({ status: 'ok', data: 'protected data' })
    )

    const req = new Request('http://localhost/api/my-protected-route', { method: 'GET' })
    const res = await handler(req)
    const body = await res.json()

    expect(res.status).toBe(402)
    expect(res.headers.get('X-X402-Quote-Id')).toBeDefined()
    expect(res.headers.get('WWW-Authenticate')).toContain('oracle-service')
    expect(body.error).toBe('Payment Required')
    expect(body.quote.serviceId).toBe('oracle-service')
  })

  it('allows access when valid receipt header is attached', async () => {
    const receipt = saveX402Receipt({
      id: 'rcpt_test_sdk_1',
      accepted: true,
      quoteId: 'q_test_1',
      paymentRef: 'oracle-service:stellar:123',
      settledAt: new Date().toISOString(),
      txHash: '0x' + '1'.repeat(64),
      chain: 'stellar',
      amountUsd: 0.1,
      amountUnits: '1000000',
      agentId: 'agent-7',
      service: 'oracle-service',
      amount: '0.1 USD',
      serviceId: 'oracle-service',
      agent: 'agent-7',
      passportVerified: true,
      reputationTier: 'standard',
    })

    const handler = withX402(
      { serviceId: 'oracle-service', unitPriceUsd: 0.1 },
      async () => Response.json({ status: 'ok', data: 'secret payload' })
    )

    const req = new Request('http://localhost/api/my-protected-route', {
      method: 'GET',
      headers: {
        'x-x402-receipt-id': receipt.id,
      },
    })
    const res = await handler(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get('X-X402-Status')).toBe('receipt_verified')
    expect(body.data).toBe('secret payload')
  })

  it('allows access when active subscription is attached', async () => {
    createX402Subscription({
      serviceId: 'oracle-service',
      agentId: 'agent-sub-1',
      plan: 'starter',
      callsPerMonth: 10,
      pricePerMonth: '1 XLM',
    })

    const handler = withX402(
      { serviceId: 'oracle-service', unitPriceUsd: 0.1 },
      async () => Response.json({ status: 'ok', data: 'subscription payload' })
    )

    const req = new Request('http://localhost/api/my-protected-route', {
      method: 'GET',
      headers: {
        'x-x402-agent-id': 'agent-sub-1',
        'x-x402-subscription-id': 'any',
      },
    })
    const res = await handler(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get('X-X402-Status')).toBe('subscription_active')
    expect(body.data).toBe('subscription payload')
  })
})
