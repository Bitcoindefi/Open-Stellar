import { describe, expect, it, vi } from 'vitest'
import { verifyStellarPayment } from '@/lib/protocols/x402'

describe('Stellar On-Chain Payment Verification', () => {
  it('rejects invalid txHash formats', async () => {
    const res = await verifyStellarPayment({
      txHash: 'invalid-hash-123',
      expectedTo: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    })
    expect(res.accepted).toBe(false)
    expect(res.error).toMatch(/Invalid Stellar txHash format/)
  })

  it('accepts valid 64-hex txHash format in test environment', async () => {
    const validHash = '0x1234567890123456789012345678901234567890123456789012345678901234'
    const res = await verifyStellarPayment({
      txHash: validHash,
      expectedTo: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    })
    expect(res.accepted).toBe(true)
  })

  it('enforces expectedAmountXlm and sender/recipient checks on create_account ops', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SKIP_ONCHAIN_VERIFICATION', 'false')

    // Mock global fetch to return a Horizon create_account operation
    const globalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          _embedded: {
            records: [
              {
                type: 'create_account',
                account: 'GRECIPIENT123456789',
                funder: 'GSENDER123456789',
                starting_balance: '5.0000000',
              },
            ],
          },
        }),
        { status: 200 }
      )
    }) as typeof fetch

    try {
      // Underpayment check: expected 10 XLM, provided 5 XLM -> rejected
      const underpayRes = await verifyStellarPayment({
        txHash: '1234567890123456789012345678901234567890123456789012345678901234',
        expectedTo: 'GRECIPIENT123456789',
        expectedFrom: 'GSENDER123456789',
        expectedAmountXlm: 10,
      })
      expect(underpayRes.accepted).toBe(false)

      // Recipient mismatch -> rejected
      const wrongToRes = await verifyStellarPayment({
        txHash: '1234567890123456789012345678901234567890123456789012345678901234',
        expectedTo: 'GWRONGRECIPIENT',
        expectedAmountXlm: 5,
      })
      expect(wrongToRes.accepted).toBe(false)

      // Valid amount & recipient on create_account -> accepted
      const validRes = await verifyStellarPayment({
        txHash: '1234567890123456789012345678901234567890123456789012345678901234',
        expectedTo: 'GRECIPIENT123456789',
        expectedFrom: 'GSENDER123456789',
        expectedAmountXlm: 5,
      })
      expect(validRes.accepted).toBe(true)
    } finally {
      globalThis.fetch = globalFetch
      vi.unstubAllEnvs()
    }
  })
})
