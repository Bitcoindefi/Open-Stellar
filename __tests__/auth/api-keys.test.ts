import { beforeEach, describe, expect, it } from 'vitest'
import {
  createApiKey,
  getAdminApiKey,
  getApiKeyRecord,
  hashKey,
  listApiKeys,
  resetApiKeyStore,
  revokeApiKey,
  rotateApiKey,
  timingSafeEqual,
  verifyApiKey,
  checkTierRateLimit,
} from '@/lib/auth/api-keys'
import { evaluateAuth } from '@/lib/auth/middleware'

describe('API Key Management & Authentication', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    ;(process.env as any).NODE_ENV = 'test'
    process.env.ADMIN_API_KEY = 'osk_admin_supersecret1234567890abcdef'
    resetApiKeyStore()
  })

  // 1. Sin clave da 401 sobre ruta admin
  it('rejects unauthenticated requests to admin routes with 401', async () => {
    const req = new Request('http://localhost:3000/admin', {
      method: 'GET',
    })
    const result = await evaluateAuth(req)

    expect(result.allowed).toBe(false)
    expect(result.status).toBe(401)
    expect(result.error).toMatch(/Unauthorized/i)
  })

  it('rejects unauthenticated requests to /api/admin/* with 401', async () => {
    const req = new Request('http://localhost:3000/api/admin/keys', {
      method: 'GET',
    })
    const result = await evaluateAuth(req)

    expect(result.allowed).toBe(false)
    expect(result.status).toBe(401)
  })

  // 2. Clave inválida da 401
  it('rejects invalid API keys with 401', async () => {
    const req = new Request('http://localhost:3000/api/admin/keys', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer osk_live_invalidkeythatdoesnotexist',
      },
    })
    const result = await evaluateAuth(req)

    expect(result.allowed).toBe(false)
    expect(result.status).toBe(401)
    expect(result.error).toMatch(/Invalid or revoked API key/i)
  })

  // 3. Clave válida pasa
  it('accepts valid admin API key via Bearer token', async () => {
    const req = new Request('http://localhost:3000/api/admin/keys', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.ADMIN_API_KEY}`,
      },
    })
    const result = await evaluateAuth(req)

    expect(result.allowed).toBe(true)
    expect(result.status).toBe(200)
    expect(result.isAdmin).toBe(true)
  })

  it('accepts valid admin API key via ?apiKey query param', async () => {
    const req = new Request(`http://localhost:3000/api/admin/keys?apiKey=${process.env.ADMIN_API_KEY}`, {
      method: 'GET',
    })
    const result = await evaluateAuth(req)

    expect(result.allowed).toBe(true)
    expect(result.status).toBe(200)
    expect(result.isAdmin).toBe(true)
  })

  // 4. Una clave revocada deja de funcionar de inmediato
  it('immediately invalidates revoked API keys', async () => {
    const created = await createApiKey({
      name: 'integration-test',
      scopes: ['x402:quote', 'agents:read'],
      tier: 'free',
    })

    // Verify key works initially
    const verifyBefore = await verifyApiKey(created.key)
    expect(verifyBefore.valid).toBe(true)

    // Revoke the key
    const revoked = await revokeApiKey(created.id)
    expect(revoked).toBe(true)

    // Verify key fails immediately
    const verifyAfter = await verifyApiKey(created.key)
    expect(verifyAfter.valid).toBe(false)
    expect(verifyAfter.error).toBe('key_revoked')

    // Middleware check with revoked key returns 401
    const req = new Request('http://localhost:3000/api/agents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${created.key}` },
    })
    const result = await evaluateAuth(req)
    expect(result.allowed).toBe(false)
    expect(result.status).toBe(401)
  })

  // 5. El almacenamiento no contiene el secreto en claro (solo hash)
  it('stores only the SHA-256 hashed secret in storage and never the plaintext key', async () => {
    const created = await createApiKey({
      name: 'secure-vault-service',
      scopes: ['x402:settle'],
      tier: 'pro',
    })

    expect(created.key).toMatch(/^osk_live_[a-f0-9]{48}$/)

    // Direct store inspection
    const storedRecord = getApiKeyRecord(created.id)
    expect(storedRecord).toBeDefined()
    expect(storedRecord?.hashedKey).toBe(hashKey(created.key))
    expect((storedRecord as any).key).toBeUndefined()
    expect(JSON.stringify(storedRecord)).not.toContain(created.key)

    // Sanitized listing inspection
    const list = await listApiKeys()
    const found = list.find((k) => k.id === created.id)
    expect(found).toBeDefined()
    expect(found?.keyPrefix).toBe(`${created.key.slice(0, 14)}...`)
    expect((found as any).hashedKey).toBeUndefined()
    expect(JSON.stringify(list)).not.toContain(created.key)
  })

  // 6. Rotación de clave invalida la anterior y devuelve nuevo secreto
  it('rotates API keys by invalidating old hash and returning a new secret', async () => {
    const created = await createApiKey({
      name: 'rotating-client',
      scopes: ['agents:read'],
      tier: 'free',
    })

    const rotated = await rotateApiKey(created.id)
    expect(rotated).toBeDefined()
    expect(rotated?.key).not.toBe(created.key)

    // Old secret fails
    const verifyOld = await verifyApiKey(created.key)
    expect(verifyOld.valid).toBe(false)

    // New secret succeeds
    const verifyNew = await verifyApiKey(rotated!.key)
    expect(verifyNew.valid).toBe(true)
    expect(verifyNew.record?.id).toBe(created.id)
  })

  // 7. Rate limiting per tier
  it('enforces tier rate limits correctly', () => {
    const windowMs = 60_000

    // No key: limit 10
    const noKeyId = 'ip-1.2.3.4'
    for (let i = 0; i < 10; i++) {
      const res = checkTierRateLimit(noKeyId, 'no_key', windowMs)
      expect(res.allowed).toBe(true)
    }
    const noKeyExceeded = checkTierRateLimit(noKeyId, 'no_key', windowMs)
    expect(noKeyExceeded.allowed).toBe(false)
    expect(noKeyExceeded.retryAfterSeconds).toBeGreaterThan(0)

    // Free tier: limit 60
    const freeKeyId = 'key_free_123'
    for (let i = 0; i < 60; i++) {
      const res = checkTierRateLimit(freeKeyId, 'free', windowMs)
      expect(res.allowed).toBe(true)
    }
    const freeExceeded = checkTierRateLimit(freeKeyId, 'free', windowMs)
    expect(freeExceeded.allowed).toBe(false)

    // Admin: unlimited
    const adminId = 'admin-user'
    for (let i = 0; i < 1000; i++) {
      const res = checkTierRateLimit(adminId, 'admin', windowMs)
      expect(res.allowed).toBe(true)
      expect(res.limit).toBe('unlimited')
    }
  })

  // 8. Scoped access and permissions
  it('enforces scoped permissions on agent write operations', async () => {
    // Key without agents:write
    const readOnlyKey = await createApiKey({
      name: 'read-only-integration',
      scopes: ['agents:read', 'x402:quote'],
    })

    const writeReq = new Request('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${readOnlyKey.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'agent-x' }),
    })

    const result = await evaluateAuth(writeReq)
    expect(result.allowed).toBe(false)
    expect(result.status).toBe(403)
    expect(result.error).toMatch(/Missing required scope agents:write/i)

    // Key with agents:write
    const writeKey = await createApiKey({
      name: 'write-integration',
      scopes: ['agents:write'],
    })

    const writeReq2 = new Request('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${writeKey.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'agent-x' }),
    })

    const result2 = await evaluateAuth(writeReq2)
    expect(result2.allowed).toBe(true)
    expect(result2.status).toBe(200)
  })

  // 9. Constant-time comparison
  it('uses constant time comparison for secrets', () => {
    const secret = 'osk_live_abcdef123456'
    expect(timingSafeEqual(secret, secret)).toBe(true)
    expect(timingSafeEqual(secret, 'osk_live_abcdef123457')).toBe(false)
    expect(timingSafeEqual(secret, 'different_length')).toBe(false)
  })

  // 10. Missing ADMIN_API_KEY in production throws on boot
  it('throws a fatal error in production mode when ADMIN_API_KEY is missing', () => {
    ;(process.env as any).NODE_ENV = 'production'
    delete process.env.ADMIN_API_KEY

    expect(() => getAdminApiKey(true)).toThrow(/FATAL: ADMIN_API_KEY environment variable is required in production/i)
  })
})
