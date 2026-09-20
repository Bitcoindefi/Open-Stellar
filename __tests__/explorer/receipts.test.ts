import { describe, expect, it } from 'vitest'
import {
  createX402Quote,
  listX402ExplorerReceipts,
  settleX402,
  type X402ExplorerReceipt,
} from '@/lib/protocols/x402'
import { saveX402Receipt } from '@/lib/protocols/x402-receipt-store'

describe('x402 payment explorer acceptance suite (#51)', () => {
  // Test 1: la respuesta no incluye campos sensibles
  it('la respuesta no incluye campos sensibles (zero operator keys, secrets, or internal endpoints)', () => {
    const maliciousPayload = {
      id: `rcpt_sec_test_${Date.now()}`,
      quoteId: 'q_sec_123',
      paymentRef: 'sec-svc:stellar:123',
      settledAt: new Date().toISOString(),
      txHash: `0x${'f'.repeat(64)}`,
      chain: 'stellar' as const,
      amountUsd: 1.0,
      amountUnits: '10000000',
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/0x${'f'.repeat(64)}`,
      agentId: 'secret-agent',
      agent: 'secret-agent',
      service: 'sec-svc',
      serviceId: 'sec-svc',
      amount: '10.0000000 XLM',
      passportVerified: true,
      reputationTier: 'gold',
      accepted: true,
      // Injected sensitive fields:
      privateKey: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      secretKey: 'sec_test_secret_key_never_leak',
      seed: 'twelve word mnemonic seed phrase that should never be public',
      secret: 'super_secret_operator_password',
      operatorKey: 'op_key_9999',
      internalEndpoint: 'https://internal-admin.stellar.local/v1/keys',
      apiKey: 'sk_live_123456789',
      authSecret: 'jwt_secret_token',
    }

    saveX402Receipt(maliciousPayload as unknown as X402ExplorerReceipt)

    const explorer = listX402ExplorerReceipts({ q: 'sec-svc' })
    expect(explorer.receipts.length).toBeGreaterThanOrEqual(1)

    const found = explorer.receipts.find((r) => r.id === maliciousPayload.id)
    expect(found).toBeDefined()

    // Assert sensitive fields are completely omitted/sanitized
    const rawKeys = Object.keys((found ?? {}) as unknown as Record<string, unknown>)
    expect(rawKeys).not.toContain('privateKey')
    expect(rawKeys).not.toContain('secretKey')
    expect(rawKeys).not.toContain('seed')
    expect(rawKeys).not.toContain('secret')
    expect(rawKeys).not.toContain('operatorKey')
    expect(rawKeys).not.toContain('internalEndpoint')
    expect(rawKeys).not.toContain('apiKey')
    expect(rawKeys).not.toContain('authSecret')

    // Confirm public fields are preserved
    expect(found?.id).toBe(maliciousPayload.id)
    expect(found?.agent).toBe('secret-agent')
    expect(found?.amount).toBe('10.0000000 XLM')
  })

  // Test 2: la búsqueda por hash encuentra
  it('la búsqueda por hash encuentra la transacción exacta', () => {
    const uniqueTxHash = '0x112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00'
    const uniqueId = `rcpt_hash_test_${Date.now()}`

    saveX402Receipt({
      id: uniqueId,
      quoteId: 'q_hash_test',
      paymentRef: 'hash-test-svc:stellar:123',
      settledAt: new Date().toISOString(),
      txHash: uniqueTxHash,
      chain: 'stellar',
      amountUsd: 0.25,
      amountUnits: '2500000',
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${uniqueTxHash}`,
      agentId: 'hash-hunter',
      agent: 'hash-hunter',
      service: 'hash-service',
      serviceId: 'hash-service',
      amount: '2.5 XLM',
      passportVerified: true,
      reputationTier: 'standard',
      accepted: true,
    })

    // Search by full hash
    const fullSearch = listX402ExplorerReceipts({ q: uniqueTxHash })
    expect(fullSearch.total).toBeGreaterThanOrEqual(1)
    expect(fullSearch.receipts.some((r) => r.txHash === uniqueTxHash)).toBe(true)

    // Search by substring of hash
    const partialSearch = listX402ExplorerReceipts({ q: 'aabbccddeeff' })
    expect(partialSearch.total).toBeGreaterThanOrEqual(1)
    expect(partialSearch.receipts.some((r) => r.id === uniqueId)).toBe(true)
  })

  // Test 3: la paginación corta
  it('la paginación corta (page size limit and slice offsets are enforced)', () => {
    const page1 = listX402ExplorerReceipts({ page: 1, pageSize: 2 })
    expect(page1.page).toBe(1)
    expect(page1.pageSize).toBe(2)
    expect(page1.receipts.length).toBeLessThanOrEqual(2)

    if (page1.total > 2) {
      const page2 = listX402ExplorerReceipts({ page: 2, pageSize: 2 })
      expect(page2.page).toBe(2)
      expect(page2.pageSize).toBe(2)
      expect(page2.receipts.length).toBeLessThanOrEqual(2)

      // Confirm disjoint items across pages
      const idsPage1 = new Set(page1.receipts.map((r) => r.id))
      const idsPage2 = new Set(page2.receipts.map((r) => r.id))
      for (const id of idsPage2) {
        expect(idsPage1.has(id)).toBe(false)
      }
    }
  })

  // Test 4: un monto grande se muestra sin redondear
  it('un monto grande se muestra sin redondear (exact precision preservation)', () => {
    const largeAmountExact = '1000000.1234567 XLM'
    const largeId = `rcpt_large_amount_${Date.now()}`

    saveX402Receipt({
      id: largeId,
      quoteId: 'q_large_quote',
      paymentRef: 'whale-svc:stellar:123',
      settledAt: new Date().toISOString(),
      txHash: `0x${'9'.repeat(64)}`,
      chain: 'stellar',
      amountUsd: 100000.012345,
      amountUnits: '10000001234567',
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/0x${'9'.repeat(64)}`,
      agentId: 'whale-agent',
      agent: 'whale-agent',
      service: 'whale-service',
      serviceId: 'whale-service',
      amount: largeAmountExact,
      passportVerified: true,
      reputationTier: 'gold',
      accepted: true,
    })

    const result = listX402ExplorerReceipts({ q: largeId })
    expect(result.receipts.length).toBe(1)
    const receipt = result.receipts[0]

    // Assert exact preservation without floating-point truncation
    expect(receipt.amount).toBe(largeAmountExact)
    expect(receipt.amount).toContain('1000000.1234567')
  })

  // Test 5: End-to-end Settlement Flow and Stellar Explorer URL
  it('records accepted settlement and generates verifiable Stellar Expert link', () => {
    const quote = createX402Quote({
      serviceId: 'oracle-service',
      chain: 'stellar',
      payer: 'Agent-Zero',
      units: 2,
      unitPriceUsd: 0.1,
    })

    const txHash = `0x${'c'.repeat(64)}`
    const settlement = settleX402({
      paymentRef: quote.paymentRef,
      chain: quote.chain,
      txHash,
      paidBy: quote.payer,
    })

    expect(settlement.ok).toBe(true)

    const query = listX402ExplorerReceipts({ q: 'Agent-Zero', chain: 'stellar' })
    expect(query.total).toBeGreaterThanOrEqual(1)
    const matching = query.receipts.find((r) => r.paymentRef === quote.paymentRef)

    expect(matching).toBeDefined()
    expect(matching?.chain).toBe('stellar')
    expect(matching?.explorerUrl).toBe(
      `https://stellar.expert/explorer/testnet/tx/${txHash}`
    )
    expect(matching?.passportVerified).toBe(true)
    expect(query.stats.totalPayments).toBeGreaterThanOrEqual(1)
  })

  // Test 6: Date range filtering
  it('filters receipts within specified date range', () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 86400000).toISOString()
    const tomorrow = new Date(now.getTime() + 86400000).toISOString()

    const results = listX402ExplorerReceipts({
      startDate: yesterday,
      endDate: tomorrow,
    })

    expect(results.receipts.length).toBeGreaterThanOrEqual(1)
    for (const r of results.receipts) {
      const settled = new Date(r.settledAt).getTime()
      expect(settled).toBeGreaterThanOrEqual(new Date(yesterday).getTime())
      expect(settled).toBeLessThanOrEqual(new Date(tomorrow).getTime())
    }
  })
})
