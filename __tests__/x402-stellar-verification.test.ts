import { describe, expect, it } from 'vitest'
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
})
