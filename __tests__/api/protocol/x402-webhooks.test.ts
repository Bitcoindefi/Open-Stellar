import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE as deleteWebhook, GET as getWebhooks, POST as registerWebhook } from '@/app/api/protocol/x402/webhooks/route'
import { createX402Quote, settleX402 } from '@/lib/protocols/x402'
import { dispatchX402Webhooks, resetX402WebhookStoreForTests } from '@/lib/protocols/x402-webhook-store'
import { resetX402ReceiptStoreForTests } from '@/lib/protocols/x402-receipt-store'

describe('x402 webhooks', () => {
  beforeEach(() => {
    resetX402WebhookStoreForTests()
    resetX402ReceiptStoreForTests()
  })

  it('registers, lists, and deletes a webhook callback', async () => {
    const regReq = new Request('http://localhost/api/protocol/x402/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        serviceId: 'data-oracle',
        url: 'https://example.com/webhook',
        secret: 'supersecret123',
      }),
    })

    const regRes = await registerWebhook(regReq)
    const regData = await regRes.json()

    expect(regRes.status).toBe(201)
    expect(regData.ok).toBe(true)
    expect(regData.webhook.serviceId).toBe('data-oracle')
    expect(regData.webhook.url).toBe('https://example.com/webhook')
    expect(regData.webhook.secret).toBe('supersecret123')

    const listRes = await getWebhooks(new Request('http://localhost/api/protocol/x402/webhooks?serviceId=data-oracle'))
    const listData = await listRes.json()

    expect(listData.webhooks.length).toBe(1)

    const delRes = await deleteWebhook(new Request(`http://localhost/api/protocol/x402/webhooks?id=${regData.webhook.id}`, { method: 'DELETE' }))
    const delData = await delRes.json()

    expect(delData.ok).toBe(true)
  })

  it('dispatches HMAC-signed webhooks on payment settlement', async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
    })

    const quote = createX402Quote({
      serviceId: 'price-feed',
      payer: 'agent-42',
      units: 1,
      unitPriceUsd: 0.1,
      chain: 'stellar',
    })

    const webhookReq = new Request('http://localhost/api/protocol/x402/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        serviceId: 'price-feed',
        url: 'https://api.my-service.com/x402-callback',
        secret: 'testsecret',
      }),
    })
    await registerWebhook(webhookReq)

    const settleResult = settleX402({
      paymentRef: quote.paymentRef,
      chain: 'stellar',
      txHash: '0x' + 'a'.repeat(64),
      paidBy: 'agent-42',
    })

    expect(settleResult.ok).toBe(true)
    expect(settleResult.receipt).toBeDefined()

    const deliveries = await dispatchX402Webhooks(settleResult.receipt!, mockFetcher as unknown as typeof fetch)

    expect(deliveries.length).toBe(1)
    expect(deliveries[0].success).toBe(true)
    expect(deliveries[0].status).toBe(200)
    expect(mockFetcher).toHaveBeenCalledTimes(1)

    const callArgs = mockFetcher.mock.calls[0]
    expect(callArgs[0]).toBe('https://api.my-service.com/x402-callback')
    const headers = callArgs[1].headers as Record<string, string>
    expect(headers['X-X402-Signature']).toBeDefined()
    expect(headers['X-X402-Signature'].startsWith('sha256=')).toBe(true)
  })
})
