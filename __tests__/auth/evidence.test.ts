import { describe, expect, it } from 'vitest'
import {
  createApiKey,
  getApiKeyRecord,
  listApiKeys,
  resetApiKeyStore,
} from '@/lib/auth/api-keys'
import { evaluateAuth } from '@/lib/auth/middleware'

describe('Visual Evidence for Verification', () => {
  it('EVIDENCIA 1: 401 sobre una ruta admin sin clave', async () => {
    resetApiKeyStore()
    process.env.ADMIN_API_KEY = 'osk_admin_live_demo1234567890abcdef'

    const req = new Request('http://localhost:3000/admin', { method: 'GET' })
    const result = await evaluateAuth(req)

    console.log('\n--- [EVIDENCIA 1: 401 SIN CLAVE] ---')
    console.log('Target Route: GET /admin')
    console.log('Authorization: <none>')
    console.log('Evaluation Result:', JSON.stringify(result, null, 2))

    expect(result.allowed).toBe(false)
    expect(result.status).toBe(401)
    expect(result.error).toBe('Unauthorized: Admin API key required')
  })

  it('EVIDENCIA 2: La misma ruta funcionando con clave válida', async () => {
    resetApiKeyStore()
    const adminKey = 'osk_admin_live_demo1234567890abcdef'
    process.env.ADMIN_API_KEY = adminKey

    const req = new Request('http://localhost:3000/admin', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminKey}` },
    })
    const result = await evaluateAuth(req)

    console.log('\n--- [EVIDENCIA 2: 200 CON CLAVE VALIDA] ---')
    console.log('Target Route: GET /admin')
    console.log(`Authorization: Bearer ${adminKey.slice(0, 14)}...`)
    console.log('Evaluation Result:', JSON.stringify(result, null, 2))

    expect(result.allowed).toBe(true)
    expect(result.status).toBe(200)
    expect(result.isAdmin).toBe(true)
  })

  it('EVIDENCIA 3: Almacenamiento mostrando el hash, no el secreto', async () => {
    resetApiKeyStore()

    const created = await createApiKey({
      name: 'production-payment-relay',
      scopes: ['x402:quote', 'x402:settle'],
      tier: 'pro',
    })

    const stored = getApiKeyRecord(created.id)
    const publicList = await listApiKeys()

    console.log('\n--- [EVIDENCIA 3: STORAGE CON HASH SHA-256] ---')
    console.log('Plaintext Generated Key (Shown ONCE):', created.key)
    console.log('Stored Record in Database/Store:', JSON.stringify(stored, null, 2))
    console.log('Sanitized Record in Public List:', JSON.stringify(publicList, null, 2))

    // Validations
    expect(stored?.hashedKey).toBeDefined()
    expect(stored?.hashedKey.length).toBe(64) // SHA-256 hex string
    expect(stored?.hashedKey).not.toBe(created.key)
    expect((stored as any).key).toBeUndefined()
    expect(JSON.stringify(stored)).not.toContain(created.key)
  })
})
