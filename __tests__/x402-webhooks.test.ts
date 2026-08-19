import { describe, expect, it, beforeEach } from 'vitest'
import {
  dispatchX402SettlementWebhook,
  listX402WebhookDeliveries,
  resetX402WebhookDeliveriesForTests,
} from '@/lib/protocols/x402-webhooks'
import { createX402Quote, settleX402 } from '@/lib/protocols/x402'
import { resetX402ReceiptStoreForTests } from '@/lib/protocols/x402-receipt-store'

describe('x402 Settlement Webhooks', () => {
  beforeEach(() => {
    resetX402WebhookDeliveriesForTests()
    resetX402ReceiptStoreForTests()
  })

  it('dispatches webhook payload on settlement', async () => {
    const log = await dispatchX402SettlementWebhook({
      accepted: true,
      quoteId: 'q_test_123',
      paymentRef: 'oracle:stellar:123',
      settledAt: new Date().toISOString(),
      txHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
      chain: 'stellar',
      amountUsd: 0.1,
    })

    expect(log.status).toBe('delivered')
    expect(log.payload.event).toBe('x402.settlement')
    expect(log.payload.receipt.quoteId).toBe('q_test_123')

    const deliveries = listX402WebhookDeliveries()
    expect(deliveries).toHaveLength(1)
  })

  it('automatically triggers webhook dispatch during settleX402', () => {
    const quote = createX402Quote({
      serviceId: 'packet-relay-mesh',
      unitPriceUsd: 0.03,
      units: 1,
      payer: 'agent-bot-1',
      chain: 'stellar',
    })

    const result = settleX402({
      paymentRef: quote.paymentRef,
      chain: 'stellar',
      txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    })

    expect(result.ok).toBe(true)
    const deliveries = listX402WebhookDeliveries()
    expect(deliveries.length).toBeGreaterThan(0)
    expect(deliveries[0].payload.receipt.txHash).toBe(
      '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    )
  })
})
