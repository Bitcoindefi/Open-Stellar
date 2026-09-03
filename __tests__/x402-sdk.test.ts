import { describe, expect, it, beforeEach } from 'vitest'
import { withX402, gateX402Request } from '@/lib/sdk/x402-sdk'
import {
  createX402Quote,
  createX402Subscription,
  resetX402SubscriptionsForTests,
} from '@/lib/protocols/x402'
import { resetX402ReceiptStoreForTests } from '@/lib/protocols/x402-receipt-store'

describe('x402 SDK (withX402)', () => {
  beforeEach(() => {
    resetX402SubscriptionsForTests()
    resetX402ReceiptStoreForTests()
  })

  it('returns HTTP 402 with quote payload when request is unpaid', async () => {
    const handler = withX402(
      { serviceId: 'stellar-oracle', unitPriceUsd: 0.05 },
      async () => Response.json({ data: 'oracle payload' }),
    )

    const req = new Request('https://openstellar.org/api/oracle')
    const res = await handler(req)

    expect(res.status).toBe(402)
    expect(res.headers.get('X-402-Quote-ID')).toBeTruthy()

    const body = await res.json()
    expect(body.code).toBe(402)
    expect(body.serviceId).toBe('stellar-oracle')
    expect(body.amountUsd).toBe(0.05)
    expect(body.options.length).toBeGreaterThanOrEqual(3)
  })

  it('allows access when request has an active subscription', async () => {
    createX402Subscription({
      serviceId: 'stellar-oracle',
      agentId: 'agent-007',
      plan: 'starter',
      callsPerMonth: 100,
    })

    const handler = withX402(
      { serviceId: 'stellar-oracle', unitPriceUsd: 0.05 },
      async () => Response.json({ data: 'oracle payload' }),
    )

    const req = new Request('https://openstellar.org/api/oracle', {
      headers: {
        'X-402-Agent-Id': 'agent-007',
      },
    })
    const res = await handler(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBe('oracle payload')
  })

  it('allows access when valid payment settlement header is supplied', async () => {
    const quote = createX402Quote({
      serviceId: 'stellar-oracle',
      unitPriceUsd: 0.05,
      units: 1,
      payer: 'agent-999',
      chain: 'stellar',
    })

    const handler = withX402(
      { serviceId: 'stellar-oracle', unitPriceUsd: 0.05 },
      async () => Response.json({ data: 'paid content' }),
    )

    const req = new Request('https://openstellar.org/api/oracle', {
      headers: {
        'X-402-Payment-Ref': quote.paymentRef,
        'X-402-Tx-Hash': '0x1234567890123456789012345678901234567890123456789012345678901234',
        'X-402-Chain': 'stellar',
        'X-402-Agent-Id': 'agent-999',
      },
    })

    const res = await handler(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBe('paid content')
  })
})
