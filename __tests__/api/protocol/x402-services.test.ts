import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/protocol/x402/services/route'

describe('/api/protocol/x402/services API Route', () => {
  it('lists registered x402 marketplace services', async () => {
    const req = new Request('https://openstellar.org/api/protocol/x402/services')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.count).toBeGreaterThan(0)
    expect(json.services.length).toBeGreaterThan(0)
    expect(json.services[0].id).toBeTruthy()
    expect(json.services[0].priceXlm).toBeGreaterThan(0)
  })
})
