import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { validateApiKey, withApiKeyAuth, isAuthenticated, getApiKeyType } from './api-key-middleware'

describe('API Key Authentication Middleware', () => {
  const mockAdminKey = 'osk_test_admin_key_123456789012'
  const mockProtocolKey = 'test_protocol_key_123456789012'

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADMIN_API_KEY = mockAdminKey
    process.env.MOLTBOT_GATEWAY_TOKEN = mockProtocolKey
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    delete process.env.ADMIN_API_KEY
    delete process.env.MOLTBOT_GATEWAY_TOKEN
    vi.restoreAllMocks()
  })

  describe('validateApiKey', () => {
    it('validates admin API key with Bearer header', () => {
      const req = new Request('http://localhost', {
        headers: { authorization: `Bearer ${mockAdminKey}` },
      })

      const result = validateApiKey(req, { keyType: 'admin' })
      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('admin')
    })

    it('validates admin API key with API-Key header', () => {
      const req = new Request('http://localhost', {
        headers: { authorization: `API-Key ${mockAdminKey}` },
      })

      const result = validateApiKey(req, { keyType: 'admin' })
      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('admin')
    })

    it('validates admin API key with X-API-Key header', () => {
      const req = new Request('http://localhost', {
        headers: { authorization: `X-API-Key ${mockAdminKey}` },
      })

      const result = validateApiKey(req, { keyType: 'admin' })
      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('admin')
    })

    it('validates protocol API key', () => {
      const req = new Request('http://localhost', {
        headers: { authorization: `Bearer ${mockProtocolKey}` },
      })

      const result = validateApiKey(req, { keyType: 'protocol' })
      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('protocol')
    })

    it('accepts both keys when keyType is any', () => {
      const adminReq = new Request('http://localhost', {
        headers: { authorization: `Bearer ${mockAdminKey}` },
      })
      const protocolReq = new Request('http://localhost', {
        headers: { authorization: `Bearer ${mockProtocolKey}` },
      })

      const adminResult = validateApiKey(adminReq, { keyType: 'any' })
      const protocolResult = validateApiKey(protocolReq, { keyType: 'any' })

      expect(adminResult.valid).toBe(true)
      expect(adminResult.keyType).toBe('admin')
      expect(protocolResult.valid).toBe(true)
      expect(protocolResult.keyType).toBe('protocol')
    })

    it('rejects admin key for protocol-only routes', () => {
      const req = new Request('http://localhost', {
        headers: { authorization: `Bearer ${mockAdminKey}` },
      })

      const result = validateApiKey(req, { keyType: 'protocol' })
      expect(result.valid).toBe(false)
    })

    it('rejects protocol key for admin-only routes', () => {
      const req = new Request('http://localhost', {
        headers: { authorization: `Bearer ${mockProtocolKey}` },
      })

      const result = validateApiKey(req, { keyType: 'admin' })
      expect(result.valid).toBe(false)
    })

    it('rejects invalid API key', () => {
      const req = new Request('http://localhost', {
        headers: { authorization: 'Bearer invalid_key' },
      })

      const result = validateApiKey(req, { keyType: 'admin' })
      expect(result.valid).toBe(false)
    })

    it('rejects missing authorization header', () => {
      const req = new Request('http://localhost')

      const result = validateApiKey(req, { keyType: 'admin' })
      expect(result.valid).toBe(false)
    })

    it('allows in development mode when allowDevMode is true', () => {
      process.env.NODE_ENV = 'development'
      const req = new Request('http://localhost')

      const result = validateApiKey(req, { keyType: 'admin', allowDevMode: true })
      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('dev')
    })

    it('does not allow in production mode even with allowDevMode', () => {
      process.env.NODE_ENV = 'production'
      const req = new Request('http://localhost')

      const result = validateApiKey(req, { keyType: 'admin', allowDevMode: true })
      expect(result.valid).toBe(false)
    })

    it('handles plain API key without prefix', () => {
      const req = new Request('http://localhost', {
        headers: { authorization: mockAdminKey },
      })

      const result = validateApiKey(req, { keyType: 'admin' })
      expect(result.valid).toBe(true)
    })
  })

  describe('withApiKeyAuth', () => {
    it('calls handler when authentication succeeds', async () => {
      const mockHandler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }))
      const req = new Request('http://localhost', {
        headers: { authorization: `Bearer ${mockAdminKey}` },
      })

      const wrappedHandler = withApiKeyAuth(mockHandler, { keyType: 'admin' })
      const response = await wrappedHandler(req)

      expect(mockHandler).toHaveBeenCalled()
      expect(response.status).toBe(200)
    })

    it('returns 401 when authentication fails', async () => {
      const mockHandler = vi.fn()
      const req = new Request('http://localhost', {
        headers: { authorization: 'Bearer invalid_key' },
      })

      const wrappedHandler = withApiKeyAuth(mockHandler, { keyType: 'admin' })
      const response = await wrappedHandler(req)

      expect(mockHandler).not.toHaveBeenCalled()
      expect(response.status).toBe(401)
      
      const data = await response.json()
      expect(data.ok).toBe(false)
      expect(data.error).toContain('Unauthorized')
    })

    it('uses custom error message', async () => {
      const mockHandler = vi.fn()
      const req = new Request('http://localhost')

      const wrappedHandler = withApiKeyAuth(mockHandler, {
        keyType: 'admin',
        errorMessage: 'Custom unauthorized message',
      })
      const response = await wrappedHandler(req)

      const data = await response.json()
      expect(data.error).toBe('Custom unauthorized message')
    })

    it('adds x-api-key-type header to request', async () => {
      const mockHandler = vi.fn().mockImplementation((req) => {
        const keyType = req.headers.get('x-api-key-type')
        return NextResponse.json({ keyType })
      })
      const req = new Request('http://localhost', {
        headers: { authorization: `Bearer ${mockAdminKey}` },
      })

      const wrappedHandler = withApiKeyAuth(mockHandler, { keyType: 'admin' })
      const response = await wrappedHandler(req)
      const data = await response.json()

      expect(data.keyType).toBe('admin')
    })
  })

  describe('isAuthenticated', () => {
    it('returns true for valid admin key', () => {
      const req = new Request('http://localhost', {
        headers: { authorization: `Bearer ${mockAdminKey}` },
      })

      expect(isAuthenticated(req)).toBe(true)
    })

    it('returns true for valid protocol key', () => {
      const req = new Request('http://localhost', {
        headers: { authorization: `Bearer ${mockProtocolKey}` },
      })

      expect(isAuthenticated(req)).toBe(true)
    })

    it('returns false for invalid key', () => {
      const req = new Request('http://localhost', {
        headers: { authorization: 'Bearer invalid' },
      })

      expect(isAuthenticated(req)).toBe(false)
    })

    it('returns false for missing key', () => {
      const req = new Request('http://localhost')

      expect(isAuthenticated(req)).toBe(false)
    })
  })

  describe('getApiKeyType', () => {
    it('returns admin key type from header', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-api-key-type': 'admin' },
      })

      expect(getApiKeyType(req)).toBe('admin')
    })

    it('returns protocol key type from header', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-api-key-type': 'protocol' },
      })

      expect(getApiKeyType(req)).toBe('protocol')
    })

    it('validates and returns key type when header not set', () => {
      const req = new Request('http://localhost', {
        headers: { authorization: `Bearer ${mockAdminKey}` },
      })

      expect(getApiKeyType(req)).toBe('admin')
    })

    it('returns null for invalid key', () => {
      const req = new Request('http://localhost', {
        headers: { authorization: 'Bearer invalid' },
      })

      expect(getApiKeyType(req)).toBeNull()
    })

    it('returns null for missing key', () => {
      const req = new Request('http://localhost')

      expect(getApiKeyType(req)).toBeNull()
    })
  })
})
