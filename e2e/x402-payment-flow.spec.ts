import { test, expect } from '@playwright/test'
import { APIHelper, APIAssertions } from './helpers/api-helpers'

test.describe('x402 Payment Flow E2E', () => {
  let apiHelper: APIHelper

  test.beforeEach(async ({ request }) => {
    apiHelper = new APIHelper(request)
  })

  test.describe('Quote Creation', () => {
    test('should create a valid x402 quote', async () => {
      const response = await apiHelper.createX402Quote({
        serviceId: 'test-service',
        chain: 'stellar',
        payer: 'test-agent-123',
        units: 1,
        unitPriceUsd: 0.1,
      })

      APIAssertions.assertSuccess(response, 'Quote creation should succeed')
      expect(response.quote).toBeDefined()
      APIAssertions.assertQuote(response.quote)
      expect(response.quote?.chain).toBe('stellar')
      expect(response.quote?.amountUsd).toBe(0.1)
    })

    test('should create quote with custom parameters', async () => {
      const response = await apiHelper.createX402Quote({
        serviceId: 'custom-service',
        chain: 'bnb',
        payer: 'custom-agent',
        units: 5,
        unitPriceUsd: 0.5,
        ttlSeconds: 600,
      })

      APIAssertions.assertSuccess(response)
      expect(response.quote?.serviceId).toBe('custom-service')
      expect(response.quote?.chain).toBe('bnb')
      expect(response.quote?.amountUsd).toBe(2.5) // 5 * 0.5
    })

    test('should handle different chains', async () => {
      const chains = ['stellar', 'bnb', 'base'] as const

      for (const chain of chains) {
        const response = await apiHelper.createX402Quote({
          chain,
          payer: `agent-${chain}`,
        })

        APIAssertions.assertSuccess(response)
        expect(response.quote?.chain).toBe(chain)
      }
    })
  })

  test.describe('Payment Settlement', () => {
    test('should settle payment successfully', async () => {
      // First create a quote
      const quoteResponse = await apiHelper.createX402Quote({
        payer: 'settle-test-agent',
        unitPriceUsd: 0.1,
      })

      APIAssertions.assertSuccess(quoteResponse)
      const { paymentRef, chain } = quoteResponse.quote!

      // Then settle the payment
      const settleResponse = await apiHelper.settleX402({
        paymentRef,
        chain,
        paidBy: 'settle-test-agent',
      })

      APIAssertions.assertSuccess(settleResponse, 'Settlement should succeed')
      expect(settleResponse.receipt).toBeDefined()
      APIAssertions.assertReceipt(settleResponse.receipt)
      expect(settleResponse.receipt?.txHash).toBeDefined()
    })

    test('should settle payment using quoteId', async () => {
      const quoteResponse = await apiHelper.createX402Quote({
        payer: 'quoteid-test-agent',
      })

      APIAssertions.assertSuccess(quoteResponse)
      const { quoteId, chain } = quoteResponse.quote!

      const settleResponse = await apiHelper.settleX402({
        quoteId,
        chain,
        paidBy: 'quoteid-test-agent',
      })

      APIAssertions.assertSuccess(settleResponse)
      expect(settleResponse.receipt).toBeDefined()
    })

    test('should handle settlement with different chains', async () => {
      const chains = ['stellar', 'bnb', 'base'] as const

      for (const chain of chains) {
        const quoteResponse = await apiHelper.createX402Quote({
          chain,
          payer: `chain-test-${chain}`,
        })

        APIAssertions.assertSuccess(quoteResponse)
        const { paymentRef } = quoteResponse.quote!

        const settleResponse = await apiHelper.settleX402({
          paymentRef,
          chain,
          paidBy: `chain-test-${chain}`,
        })

        APIAssertions.assertSuccess(settleResponse)
        expect(settleResponse.receipt?.chain).toBe(chain)
      }
    })

    test('should fail settlement with invalid paymentRef', async () => {
      const settleResponse = await apiHelper.settleX402({
        paymentRef: 'invalid-payment-ref',
        chain: 'stellar',
      })

      APIAssertions.assertFailure(settleResponse, 'Quote not found')
    })

    test('should fail settlement with invalid tx hash format', async () => {
      const quoteResponse = await apiHelper.createX402Quote({
        payer: 'txhash-test-agent',
      })

      APIAssertions.assertSuccess(quoteResponse)
      const { paymentRef, chain } = quoteResponse.quote!

      const settleResponse = await apiHelper.settleX402({
        paymentRef,
        chain,
        txHash: 'invalid-tx-hash',
      })

      APIAssertions.assertFailure(settleResponse, 'Invalid tx hash format')
    })
  })

  test.describe('Complete Payment Flow', () => {
    test('should complete full quote-to-settle flow', async () => {
      // Step 1: Create quote
      const quoteResponse = await apiHelper.createX402Quote({
        serviceId: 'full-flow-service',
        payer: 'full-flow-agent',
        units: 3,
        unitPriceUsd: 0.25,
      })

      APIAssertions.assertSuccess(quoteResponse)
      const { paymentRef, chain, amountUsd, quoteId } = quoteResponse.quote!
      expect(amountUsd).toBe(0.75) // 3 * 0.25

      // Step 2: Settle payment
      const settleResponse = await apiHelper.settleX402({
        paymentRef,
        chain,
        paidBy: 'full-flow-agent',
      })

      APIAssertions.assertSuccess(settleResponse)
      const { receipt } = settleResponse
      expect(receipt).toBeDefined()
      expect(receipt?.amountUsd).toBe(amountUsd)
      expect(receipt?.paymentRef).toBe(paymentRef)
    })

    test('should handle multiple sequential payments', async () => {
      const payments = []

      for (let i = 0; i < 3; i++) {
        const quoteResponse = await apiHelper.createX402Quote({
          payer: `sequential-agent-${i}`,
          unitPriceUsd: 0.1 + (i * 0.05),
        })

        APIAssertions.assertSuccess(quoteResponse)
        const { paymentRef, chain } = quoteResponse.quote!

        const settleResponse = await apiHelper.settleX402({
          paymentRef,
          chain,
          paidBy: `sequential-agent-${i}`,
        })

        APIAssertions.assertSuccess(settleResponse)
        payments.push({
          quote: quoteResponse.quote,
          receipt: settleResponse.receipt,
        })
      }

      expect(payments).toHaveLength(3)
      // Verify each payment has unique receipt
      const receiptIds = payments.map(p => p.receipt?.id)
      const uniqueIds = new Set(receiptIds)
      expect(uniqueIds.size).toBe(3)
    })
  })

  test.describe('Passport Gate Integration', () => {
    test('should authorize payment with valid passport', async () => {
      const authResponse = await apiHelper.authorizePassportPayment({
        agentId: '42', // Known test agent with passport
        amount: '10000000', // 1 XLM in stroops
      })

      APIAssertions.assertSuccess(authResponse)
      expect(authResponse.authorized).toBe(true)
      expect(authResponse.reason).toContain('Within proven spend cap')
      expect(authResponse.cap).toBeDefined()
    })

    test('should deny payment exceeding spend cap', async () => {
      const authResponse = await apiHelper.authorizePassportPayment({
        agentId: '42',
        amount: '500000000', // 50 XLM (exceeds typical cap)
      })

      APIAssertions.assertFailure(authResponse, 'Exceeds proven spend cap')
      expect(authResponse.authorized).toBe(false)
    })

    test('should deny payment for agent without passport', async () => {
      const authResponse = await apiHelper.authorizePassportPayment({
        agentId: 'non-existent-agent',
        amount: '10000000',
      })

      APIAssertions.assertFailure(authResponse, 'No active passport')
      expect(authResponse.authorized).toBe(false)
    })

    test('should integrate passport gate with x402 settlement', async () => {
      // Create quote
      const quoteResponse = await apiHelper.createX402Quote({
        payer: '42', // Agent with passport
        unitPriceUsd: 0.1,
      })

      APIAssertions.assertSuccess(quoteResponse)
      const { paymentRef, chain } = quoteResponse.quote!

      // Settle with agentId (triggers passport gate)
      const settleResponse = await apiHelper.settleX402({
        paymentRef,
        chain,
        paidBy: '42',
        agentId: '42',
      })

      APIAssertions.assertSuccess(settleResponse)
      expect(settleResponse.receipt).toBeDefined()
    })

    test('should block settlement when passport gate denies', async () => {
      const quoteResponse = await apiHelper.createX402Quote({
        payer: '42',
        unitPriceUsd: 100, // Large amount exceeding cap
      })

      APIAssertions.assertSuccess(quoteResponse)
      const { paymentRef, chain } = quoteResponse.quote!

      const settleResponse = await apiHelper.settleX402({
        paymentRef,
        chain,
        paidBy: '42',
        agentId: '42',
      })

      APIAssertions.assertFailure(settleResponse, 'Passport gate')
      expect(settleResponse.error).toContain('Passport gate')
    })
  })

  test.describe('Error Handling', () => {
    test('should handle missing required parameters', async () => {
      const response = await apiHelper.createX402Quote({
        // Missing required fields
      })

      // Should still succeed with defaults
      APIAssertions.assertSuccess(response)
    })

    test('should handle invalid chain parameter', async () => {
      const response = await apiHelper.createX402Quote({
        chain: 'invalid-chain' as any,
      })

      // Should default to valid chain
      APIAssertions.assertSuccess(response)
      expect(['stellar', 'bnb', 'base']).toContain(response.quote?.chain)
    })

    test('should handle zero amount', async () => {
      const response = await apiHelper.createX402Quote({
        units: 0,
        unitPriceUsd: 0.1,
      })

      APIAssertions.assertSuccess(response)
      expect(response.quote?.amountUsd).toBe(0)
    })
  })
})
