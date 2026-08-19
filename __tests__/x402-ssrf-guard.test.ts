import { describe, expect, it, beforeEach } from 'vitest'
import {
  validateWebhookTargetUrl,
  isPrivateOrLoopbackHost,
  dispatchX402SettlementWebhook,
  resetX402WebhookDeliveriesForTests,
} from '@/lib/protocols/x402-webhooks'
import { POST } from '@/app/api/protocol/x402/webhooks/route'

describe('SSRF Guard & Webhook Auth Security', () => {
  beforeEach(() => {
    resetX402WebhookDeliveriesForTests()
  })

  it('detects private, loopback, and cloud metadata hostnames', () => {
    expect(isPrivateOrLoopbackHost('localhost')).toBe(true)
    expect(isPrivateOrLoopbackHost('127.0.0.1')).toBe(true)
    expect(isPrivateOrLoopbackHost('169.254.169.254')).toBe(true)
    expect(isPrivateOrLoopbackHost('10.0.0.5')).toBe(true)
    expect(isPrivateOrLoopbackHost('192.168.1.100')).toBe(true)
    expect(isPrivateOrLoopbackHost('172.20.0.1')).toBe(true)
    expect(isPrivateOrLoopbackHost('example.internal')).toBe(true)

    expect(isPrivateOrLoopbackHost('api.example.com')).toBe(false)
  })

  it('rejects SSRF target URLs in validateWebhookTargetUrl', () => {
    expect(() => validateWebhookTargetUrl('http://169.254.169.254/latest/meta-data')).toThrow(
      /private\/loopback\/metadata/
    )
    expect(() => validateWebhookTargetUrl('http://localhost:8080/admin')).toThrow(
      /private\/loopback\/metadata/
    )
    expect(() => validateWebhookTargetUrl('http://127.0.0.1/internal')).toThrow(
      /private\/loopback\/metadata/
    )
  })

  it('prevents SSRF dispatches via dispatchX402SettlementWebhook', async () => {
    const log = await dispatchX402SettlementWebhook(
      {
        accepted: true,
        quoteId: 'q_123',
        paymentRef: 'ref_123',
        settledAt: new Date().toISOString(),
        txHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
        chain: 'stellar',
      },
      'http://169.254.169.254/latest/meta-data'
    )

    expect(log.status).toBe('failed')
    expect(log.error).toMatch(/private\/loopback\/metadata/)
  })

  it('rejects unauthenticated POST requests to /api/protocol/x402/webhooks', async () => {
    const req = new Request('https://openstellar.org/api/protocol/x402/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receipt: { paymentRef: 'test' },
      }),
    })

    // Set ADMIN_SECRET to simulate production auth requirement
    const oldSecret = process.env.ADMIN_SECRET
    process.env.ADMIN_SECRET = 'top-secret-key'

    try {
      const res = await POST(req)
      expect(res.status).toBe(401)
    } finally {
      process.env.ADMIN_SECRET = oldSecret
    }
  })
})
