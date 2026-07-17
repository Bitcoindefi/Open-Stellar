import { describe, it, expect, beforeEach, vi } from 'vitest'
import type {
  SkillListing,
  SkillInvocationRequest,
} from '../x402-middleware'
import {
  listInvocations,
  resetInvocationLedgerForTests,
} from '../invocation-ledger'
import { resetX402SubscriptionsForTests } from '@/lib/protocols/x402'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

vi.mock('@/lib/mock/mock-mode', () => ({
  isMockMode: () => true,
}))

vi.mock('@/lib/mock/x402-mock', () => ({
  settleMockX402: vi.fn(({ paymentRef, chain }) => ({
    txHash: `mock_tx_${paymentRef}_${chain}_hash`,
    accepted: true,
    settledAt: new Date().toISOString(),
  })),
}))

vi.mock('@/lib/passport/passport', () => ({
  authorizePayment: vi.fn(() => Promise.resolve({ authorized: true, cap: '100000000' })),
}))

vi.mock('@/lib/gamification/xp', () => ({
  awardXP: vi.fn(),
}))

vi.mock('@/lib/events/system-events', () => ({
  publishSystemEvent: vi.fn(),
}))

describe('x402-middleware', () => {
  const mockSkill: SkillListing = {
    id: 'skill_123',
    agentId: 'agent_seller_1',
    callUrl: 'https://api.example.com/skills/analyze',
    priceXLM: 0.5,
    ownerWallet: 'GCFXHS4FXFPMKTLHLQQBB4OHO56L4D3SEZ3DPF4B2HYG5B3J2K4Q5Z6A',
    name: 'Text Analyzer',
    description: 'Analyzes text sentiment',
  }

  const mockRequest: SkillInvocationRequest = {
    agentId: 'agent_buyer_1',
    payload: { text: 'Hello world' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resetInvocationLedgerForTests()
    resetX402SubscriptionsForTests()
    mockFetch.mockReset()
  })

  it('should return 200 immediately if skill does not require payment', async () => {
    const { invokeSkillWithPayment } = await import('../x402-middleware')

    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ result: 'analysis_complete', sentiment: 'positive' }),
    })

    const result = await invokeSkillWithPayment(mockSkill, mockRequest)

    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.data).toEqual({ result: 'analysis_complete', sentiment: 'positive' })
    expect(result.paymentProof).toBeUndefined()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should handle 402 -> payment -> 200 flow with correct txHash in ledger', async () => {
    const { invokeSkillWithPayment } = await import('../x402-middleware')

    const mockQuote = {
      code: 402,
      quoteId: 'q_abc123',
      paymentRef: 'skill_123:stellar:1690000000000',
      serviceId: 'skill_123',
      chain: 'stellar',
      payer: 'agent_buyer_1',
      amountUsd: 0.05,
      amountUnits: '5000000',
      address: mockSkill.ownerWallet,
      options: [
        {
          chain: 'stellar',
          amount: '0.5 XLM',
          amountUnits: '5000000',
          address: mockSkill.ownerWallet,
        },
      ],
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      memo: 'x402/skill_123/q_abc123',
    }

    mockFetch
      .mockResolvedValueOnce({
        status: 402,
        json: async () => mockQuote,
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ result: 'paid_analysis', sentiment: 'positive' }),
      })

    const result = await invokeSkillWithPayment(mockSkill, mockRequest)

    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.data).toEqual({ result: 'paid_analysis', sentiment: 'positive' })
    expect(result.paymentProof).toBeDefined()
    expect(result.paymentProof?.txHash).toMatch(/^mock_tx_/)
    expect(result.paymentProof?.chain).toBe('stellar')

    const invocations = listInvocations({ skillId: 'skill_123' })
    expect(invocations.length).toBe(1)
    expect(invocations[0].txHash).toBe(result.paymentProof?.txHash)
    expect(invocations[0].amountXLM).toBe(0.5)
    expect(invocations[0].agentId).toBe('agent_buyer_1')
    expect(invocations[0].status).toBe('success')
  })

  it('should return 402 with insufficient_balance when payment fails due to low funds', async () => {
    vi.resetModules()

    vi.doMock('@/lib/mock/mock-mode', () => ({
      isMockMode: () => false,
    }))

    const { invokeSkillWithPayment } = await import('../x402-middleware')

    const mockQuote = {
      code: 402,
      quoteId: 'q_def456',
      paymentRef: 'skill_123:stellar:1690000000001',
      serviceId: 'skill_123',
      chain: 'stellar',
      payer: 'agent_buyer_1',
      amountUsd: 0.05,
      amountUnits: '5000000',
      address: mockSkill.ownerWallet,
      options: [
        {
          chain: 'stellar',
          amount: '0.5 XLM',
          amountUnits: '5000000',
          address: mockSkill.ownerWallet,
        },
      ],
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      memo: 'x402/skill_123/q_def456',
    }

    mockFetch.mockResolvedValueOnce({
      status: 402,
      json: async () => mockQuote,
    })

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'insufficient_balance' }),
    })

    const result = await invokeSkillWithPayment(mockSkill, {
      ...mockRequest,
      payerWallet: 'GCFXHS4FXFPMKTLHLQQBB4OHO56L4D3SEZ3DPF4B2HYG5B3J2K4Q5Z6A',
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(402)
    expect(result.error).toBe('insufficient_balance')
  })

  it('should record failed invocation in ledger when skill returns error after payment', async () => {
    const { invokeSkillWithPayment } = await import('../x402-middleware')

    const mockQuote = {
      code: 402,
      quoteId: 'q_ghi789',
      paymentRef: 'skill_123:stellar:1690000000002',
      serviceId: 'skill_123',
      chain: 'stellar',
      payer: 'agent_buyer_1',
      amountUsd: 0.05,
      amountUnits: '5000000',
      address: mockSkill.ownerWallet,
      options: [
        {
          chain: 'stellar',
          amount: '0.5 XLM',
          amountUnits: '5000000',
          address: mockSkill.ownerWallet,
        },
      ],
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      memo: 'x402/skill_123/q_ghi789',
    }

    mockFetch
      .mockResolvedValueOnce({
        status: 402,
        json: async () => mockQuote,
      })
      .mockResolvedValueOnce({
        status: 500,
        json: async () => ({ error: 'internal_skill_error' }),
      })

    const result = await invokeSkillWithPayment(mockSkill, mockRequest)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)

    const invocations = listInvocations({ skillId: 'skill_123', status: 'failed' })
    expect(invocations.length).toBe(1)
    expect(invocations[0].error).toBeDefined()
  })

  it('should propagate non-402 errors without attempting payment', async () => {
    const { invokeSkillWithPayment } = await import('../x402-middleware')

    mockFetch.mockResolvedValueOnce({
      status: 404,
      json: async () => ({ error: 'skill_endpoint_not_found' }),
    })

    const result = await invokeSkillWithPayment(mockSkill, mockRequest)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
