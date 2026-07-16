import { test, expect } from '@playwright/test'
import { APIHelper, APIAssertions } from './helpers/api-helpers'

test.describe('ZK Passport Mint Smoke Test', () => {
  let apiHelper: APIHelper

  test.beforeEach(async ({ request }) => {
    apiHelper = new APIHelper(request)
  })

  test.describe('Passport Status API', () => {
    test('should retrieve passport status for known agent', async () => {
      const response = await apiHelper.getPassportStatus('42')

      expect(response).toBeDefined()
      expect(response.ok).toBe(true)
      expect(response.passport).toBeDefined()
      
      const passport = response.passport
      expect(passport).toHaveProperty('agentId')
      expect(passport).toHaveProperty('spendCap')
      expect(passport).toHaveProperty('status')
      expect(passport).toHaveProperty('issuedAt')
      expect(passport).toHaveProperty('expiresAt')
    })

    test('should return null for non-existent agent', async () => {
      const response = await apiHelper.getPassportStatus('non-existent-agent-12345')

      expect(response).toBeDefined()
      expect(response.ok).toBe(true)
      expect(response.passport).toBeNull()
    })

    test('should include network information in passport', async () => {
      const response = await apiHelper.getPassportStatus('42')

      expect(response.passport).toHaveProperty('network')
      expect(['testnet', 'mainnet']).toContain(response.passport.network)
    })

    test('should include registry root and nullifier hash', async () => {
      const response = await apiHelper.getPassportStatus('42')

      expect(response.passport).toHaveProperty('registryRoot')
      expect(response.passport).toHaveProperty('nullifierHash')
      expect(response.passport.registryRoot).toMatch(/^0x[a-fA-F0-9]+$/)
      expect(response.passport.nullifierHash).toMatch(/^0x[a-fA-F0-9]+$/)
    })
  })

  test.describe('Passport Authorization', () => {
    test('should authorize payment within spend cap', async () => {
      const response = await apiHelper.authorizePassportPayment({
        agentId: '42',
        amount: '10000000', // 1 XLM in stroops
      })

      APIAssertions.assertSuccess(response)
      expect(response.authorized).toBe(true)
      expect(response.reason).toContain('Within proven spend cap')
      expect(response.cap).toBeDefined()
      expect(response.cap).toMatch(/^\d+$/)
    })

    test('should deny payment exceeding spend cap', async () => {
      const response = await apiHelper.authorizePassportPayment({
        agentId: '42',
        amount: '1000000000', // 100 XLM (exceeds typical cap)
      })

      APIAssertions.assertFailure(response, 'Exceeds proven spend cap')
      expect(response.authorized).toBe(false)
      expect(response.cap).toBeDefined()
    })

    test('should deny payment for agent without passport', async () => {
      const response = await apiHelper.authorizePassportPayment({
        agentId: 'agent-without-passport-999',
        amount: '10000000',
      })

      APIAssertions.assertFailure(response, 'No active passport')
      expect(response.authorized).toBe(false)
    })

    test('should handle zero amount correctly', async () => {
      const response = await apiHelper.authorizePassportPayment({
        agentId: '42',
        amount: '0',
      })

      APIAssertions.assertSuccess(response)
      expect(response.authorized).toBe(true)
    })

    test('should handle very small amounts', async () => {
      const response = await apiHelper.authorizePassportPayment({
        agentId: '42',
        amount: '1', // 1 stroop (very small)
      })

      APIAssertions.assertSuccess(response)
      expect(response.authorized).toBe(true)
    })
  })

  test.describe('Passport Gate Integration with x402', () => {
    test('should allow settlement with valid passport', async () => {
      // Create quote for agent with passport
      const quoteResponse = await apiHelper.createX402Quote({
        payer: '42',
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
      expect(settleResponse.receipt?.passportVerified).toBe(true)
    })

    test('should block settlement when amount exceeds cap', async () => {
      // Create quote with large amount
      const quoteResponse = await apiHelper.createX402Quote({
        payer: '42',
        unitPriceUsd: 100, // Large amount
      })

      APIAssertions.assertSuccess(quoteResponse)
      const { paymentRef, chain } = quoteResponse.quote!

      // Settlement should be blocked by passport gate
      const settleResponse = await apiHelper.settleX402({
        paymentRef,
        chain,
        paidBy: '42',
        agentId: '42',
      })

      APIAssertions.assertFailure(settleResponse, 'Passport gate')
      expect(settleResponse.error).toContain('Passport gate')
    })

    test('should allow settlement without agentId (no passport check)', async () => {
      const quoteResponse = await apiHelper.createX402Quote({
        payer: '42',
        unitPriceUsd: 100,
      })

      APIAssertions.assertSuccess(quoteResponse)
      const { paymentRef, chain } = quoteResponse.quote!

      // Settle without agentId (bypasses passport gate)
      const settleResponse = await apiHelper.settleX402({
        paymentRef,
        chain,
        paidBy: '42',
        // No agentId provided
      })

      APIAssertions.assertSuccess(settleResponse)
      expect(settleResponse.receipt).toBeDefined()
    })

    test('should include gate information in error response', async () => {
      const quoteResponse = await apiHelper.createX402Quote({
        payer: '42',
        unitPriceUsd: 100,
      })

      APIAssertions.assertSuccess(quoteResponse)
      const { paymentRef, chain } = quoteResponse.quote!

      const settleResponse = await apiHelper.settleX402({
        paymentRef,
        chain,
        paidBy: '42',
        agentId: '42',
      })

      APIAssertions.assertFailure(settleResponse)
      expect(settleResponse.gate).toBeDefined()
      expect(settleResponse.gate).toHaveProperty('authorized')
      expect(settleResponse.gate).toHaveProperty('reason')
      expect(settleResponse.gate).toHaveProperty('cap')
    })
  })

  test.describe('Passport Lifecycle', () => {
    test('should track passport expiration', async () => {
      const response = await apiHelper.getPassportStatus('42')

      const passport = response.passport
      expect(passport).toHaveProperty('expiresAt')
      
      const expiresAt = new Date(passport.expiresAt)
      const now = new Date()
      
      // Passport should not be expired for test agent
      expect(expiresAt.getTime()).toBeGreaterThan(now.getTime())
    })

    test('should report passport status correctly', async () => {
      const response = await apiHelper.getPassportStatus('42')

      const passport = response.passport
      expect(['ACTIVE', 'EXPIRED', 'REVOKED']).toContain(passport.status)
      
      // Test agent should have active passport
      expect(passport.status).toBe('ACTIVE')
    })

    test('should include transaction hash if verified on-chain', async () => {
      const response = await apiHelper.getPassportStatus('42')

      const passport = response.passport
      // May or may not have txHash depending on verification status
      if (passport.txHash) {
        expect(passport.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/)
      }
    })
  })

  test.describe('Passport Data Integrity', () => {
    test('should have consistent spend cap across calls', async () => {
      const response1 = await apiHelper.getPassportStatus('42')
      const response2 = await apiHelper.getPassportStatus('42')

      expect(response1.passport.spendCap).toBe(response2.passport.spendCap)
    })

    test('should have consistent registry root across calls', async () => {
      const response1 = await apiHelper.getPassportStatus('42')
      const response2 = await apiHelper.getPassportStatus('42')

      expect(response1.passport.registryRoot).toBe(response2.passport.registryRoot)
    })

    test('should have unique nullifier hash per passport', async () => {
      const response = await apiHelper.getPassportStatus('42')

      const passport = response.passport
      expect(passport.nullifierHash).toBeDefined()
      expect(passport.nullifierHash.length).toBeGreaterThan(0)
    })
  })

  test.describe('Edge Cases', () => {
    test('should handle empty agentId gracefully', async () => {
      const response = await apiHelper.getPassportStatus('')

      expect(response).toBeDefined()
      expect(response.ok).toBe(true)
      expect(response.passport).toBeNull()
    })

    test('should handle special characters in agentId', async () => {
      const response = await apiHelper.getPassportStatus('agent-with-special-chars_!@#$')

      expect(response).toBeDefined()
      expect(response.ok).toBe(true)
      expect(response.passport).toBeNull()
    })

    test('should handle very long agentId', async () => {
      const longAgentId = 'a'.repeat(500)
      const response = await apiHelper.getPassportStatus(longAgentId)

      expect(response).toBeDefined()
      expect(response.ok).toBe(true)
      expect(response.passport).toBeNull()
    })
  })
})
