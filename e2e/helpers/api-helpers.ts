import { APIRequestContext, expect } from '@playwright/test'

export interface X402QuoteResponse {
  ok: boolean
  quote?: {
    quoteId: string
    paymentRef: string
    amountUsd: number
    amountUnits: string
    address: string
    chain: string
    expiresAt: string
  }
  error?: string
}

export interface X402SettleResponse {
  ok: boolean
  receipt?: {
    id: string
    txHash: string
    amountUsd: number
    settledAt: string
  }
  error?: string
}

export interface PassportAuthorizeResponse {
  ok: boolean
  authorized: boolean
  reason: string
  cap?: string
  error?: string
}

/**
 * Helper class for API interactions in E2E tests
 */
export class APIHelper {
  private protocolApiKey: string
  private adminApiKey: string

  constructor(private request: APIRequestContext) {
    // Get API keys from environment or use test defaults
    this.protocolApiKey = process.env.TEST_PROTOCOL_API_KEY || 'test-protocol-key'
    this.adminApiKey = process.env.TEST_ADMIN_API_KEY || 'test-admin-key'
  }

  /**
   * Create headers with API key authentication
   */
  private getAuthHeaders(keyType: 'protocol' | 'admin' = 'protocol'): Record<string, string> {
    const apiKey = keyType === 'protocol' ? this.protocolApiKey : this.adminApiKey
    return {
      'Authorization': `Bearer ${apiKey}`,
    }
  }

  /**
   * Create an x402 quote
   */
  async createX402Quote(params: {
    serviceId?: string
    chain?: string
    payer?: string
    units?: number
    unitPriceUsd?: number
    ttlSeconds?: number
  }): Promise<X402QuoteResponse> {
    const response = await this.request.post('/api/protocol/x402/quote', {
      headers: this.getAuthHeaders('protocol'),
      data: {
        serviceId: params.serviceId || 'ai-agent-service',
        chain: params.chain || 'stellar',
        payer: params.payer || 'test-agent',
        units: params.units || 1,
        unitPriceUsd: params.unitPriceUsd || 0.1,
        ttlSeconds: params.ttlSeconds || 300,
      },
    })

    return await response.json()
  }

  /**
   * Settle an x402 payment
   */
  async settleX402(params: {
    paymentRef?: string
    quoteId?: string
    chain?: string
    txHash?: string
    paidBy?: string
    agentId?: string
  }): Promise<X402SettleResponse> {
    const response = await this.request.post('/api/protocol/x402/settle', {
      headers: this.getAuthHeaders('protocol'),
      data: {
        paymentRef: params.paymentRef,
        quoteId: params.quoteId,
        chain: params.chain || 'stellar',
        txHash: params.txHash || this.generateMockTxHash(),
        paidBy: params.paidBy || 'test-agent',
        agentId: params.agentId,
      },
    })

    return await response.json()
  }

  /**
   * Authorize passport payment
   */
  async authorizePassportPayment(params: {
    agentId: string
    amount: string
  }): Promise<PassportAuthorizeResponse> {
    const response = await this.request.post('/api/protocol/passport/authorize', {
      headers: this.getAuthHeaders('protocol'),
      data: params,
    })

    return await response.json()
  }

  /**
   * Get passport status
   */
  async getPassportStatus(agentId: string) {
    const response = await this.request.get(
      `/api/protocol/passport/status?agentId=${agentId}`,
      {
        headers: this.getAuthHeaders('protocol'),
      }
    )
    return await response.json()
  }

  /**
   * Generate a mock transaction hash for testing
   */
  private generateMockTxHash(): string {
    return '0x' + Array.from({ length: 64 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('')
  }

  /**
   * Wait for a condition to be true with timeout
   */
  async waitForCondition(
    condition: () => boolean | Promise<boolean>,
    timeout = 5000,
    interval = 100
  ): Promise<void> {
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, interval))
    }
    throw new Error(`Condition not met within ${timeout}ms`)
  }
}

/**
 * Assert helpers for common API responses
 */
export class APIAssertions {
  static assertSuccess(response: { ok: boolean; error?: string }, message = 'Request should succeed') {
    expect(response.ok, message).toBe(true)
    expect(response.error).toBeUndefined()
  }

  static assertFailure(response: { ok: boolean; error?: string }, expectedError?: string) {
    expect(response.ok, 'Request should fail').toBe(false)
    if (expectedError) {
      expect(response.error).toContain(expectedError)
    }
  }

  static assertQuote(quote: any) {
    expect(quote).toHaveProperty('quoteId')
    expect(quote).toHaveProperty('paymentRef')
    expect(quote).toHaveProperty('amountUsd')
    expect(quote).toHaveProperty('amountUnits')
    expect(quote).toHaveProperty('address')
    expect(quote).toHaveProperty('chain')
    expect(quote).toHaveProperty('expiresAt')
  }

  static assertReceipt(receipt: any) {
    expect(receipt).toHaveProperty('id')
    expect(receipt).toHaveProperty('txHash')
    expect(receipt).toHaveProperty('amountUsd')
    expect(receipt).toHaveProperty('settledAt')
  }
}
