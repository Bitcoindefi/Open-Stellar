export type ApiKeyTier = 'no_key' | 'free' | 'pro' | 'admin'

export interface ApiKeyRecord {
  id: string
  name: string
  keyPrefix: string
  hashedKey: string
  scopes: string[]
  tier: ApiKeyTier
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  requestCount: number
}

export interface SanitizedApiKey {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  tier: ApiKeyTier
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  requestCount: number
  status: 'active' | 'expired' | 'revoked'
}

export interface CreateApiKeyInput {
  name: string
  scopes: string[]
  tier?: ApiKeyTier
  expiresAt?: string | null
}

export interface CreateApiKeyResult {
  id: string
  key: string
  name: string
  keyPrefix: string
  scopes: string[]
  tier: ApiKeyTier
  expiresAt: string | null
  createdAt: string
}

export interface RateLimitStatus {
  allowed: boolean
  tier: ApiKeyTier
  limit: number | 'unlimited'
  remaining: number | 'unlimited'
  retryAfterSeconds: number
  resetTimeMs: number
}

export interface VerificationResult {
  valid: boolean
  record?: ApiKeyRecord
  tier: ApiKeyTier
  scopes: string[]
  isAdmin: boolean
  error?: string
}

// Global in-memory storage for persistent server runtime
const globalState = globalThis as typeof globalThis & {
  __openStellarApiKeyStore__?: Map<string, ApiKeyRecord>
  __openStellarRateLimits__?: Map<string, number[]>
  __openStellarAdminApiKey__?: string
}

function getKeyStore(): Map<string, ApiKeyRecord> {
  if (!globalState.__openStellarApiKeyStore__) {
    globalState.__openStellarApiKeyStore__ = new Map<string, ApiKeyRecord>()
  }
  return globalState.__openStellarApiKeyStore__
}

function getRateLimitStore(): Map<string, number[]> {
  if (!globalState.__openStellarRateLimits__) {
    globalState.__openStellarRateLimits__ = new Map<string, number[]>()
  }
  return globalState.__openStellarRateLimits__
}

export function resetApiKeyStore() {
  getKeyStore().clear()
  getRateLimitStore().clear()
  delete globalState.__openStellarAdminApiKey__
}

/**
 * Universal random hex generator (works in Node.js, Next.js Edge, and Browser)
 */
export function generateRandomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < byteCount; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Pure TypeScript standard SHA-256 implementation (zero native dependencies, universally compatible)
 */
export function sha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount))
  }

  const mathPow = Math.pow
  const maxWord = mathPow(2, 32)
  let i = 0, j = 0
  let result = ''

  const words: number[] = []
  const asciiBitLength = ascii.length * 8

  const hash: number[] = []
  const k: number[] = []
  let primeCounter = 0

  const isComposite: Record<number, number> = {}
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let idx = 0; idx < 313; idx += candidate) {
        isComposite[idx] = candidate
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0
    }
  }

  ascii += '\x80'
  while ((ascii.length % 64) - 56) ascii += '\x00'
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i)
    if (j >> 8) return ''
    words[i >> 2] = (words[i >> 2] || 0) | (j << (((3 - i) % 4) * 8))
  }
  words[words.length] = (asciiBitLength / maxWord) | 0
  words[words.length] = asciiBitLength | 0

  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16))
    const oldHash = hash.slice(0)

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15] ?? 0,
        w2 = w[i - 2] ?? 0

      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10)
      w[i] =
        i < 16
          ? w[i]
          : (w[i - 16] + s0 + w[i - 7] + s1) | 0

      const s1h = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6])
      const temp1 = (hash[7] + s1h + ch + k[i] + w[i]) | 0
      const s0h = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2])
      const temp2 = (s0h + maj) | 0

      hash[7] = hash[6]
      hash[6] = hash[5]
      hash[5] = hash[4]
      hash[4] = (hash[3] + temp1) | 0
      hash[3] = hash[2]
      hash[2] = hash[1]
      hash[1] = hash[0]
      hash[0] = (temp1 + temp2) | 0
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0
    }
  }

  for (i = 0; i < 8; i++) {
    for (let i2 = 3; i2 >= 0; i2--) {
      const byte = (hash[i] >> (i2 * 8)) & 255
      result += (byte < 16 ? '0' : '') + byte.toString(16)
    }
  }
  return result
}

export function hashKey(secret: string): string {
  return sha256(secret)
}

/**
 * Constant-time comparison between two strings to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const hashA = hashKey(a)
  const hashB = hashKey(b)
  if (hashA.length !== hashB.length) return false
  let diff = 0
  for (let i = 0; i < hashA.length; i++) {
    diff |= hashA.charCodeAt(i) ^ hashB.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Validates and retrieves the Admin API key.
 * In strict production mode, throws if ADMIN_API_KEY is not defined.
 */
export function getAdminApiKey(strictCheck = false): string {
  const envKey = process.env.ADMIN_API_KEY?.trim()
  if (envKey) {
    return envKey
  }

  const isProduction = process.env.NODE_ENV === 'production'
  if (isProduction || strictCheck) {
    throw new Error('FATAL: ADMIN_API_KEY environment variable is required in production.')
  }

  // Development/test auto-generated fallback on first boot
  if (!globalState.__openStellarAdminApiKey__) {
    const randomHex = generateRandomHex(24)
    globalState.__openStellarAdminApiKey__ = `osk_${randomHex}`
  }

  return globalState.__openStellarAdminApiKey__
}

/**
 * Generates a cryptographically secure random API key.
 * Format: osk_live_<48 hex chars>
 */
export function generateKeySecret(): string {
  return `osk_live_${generateRandomHex(24)}`
}

export function generateKeyId(): string {
  return `key_${generateRandomHex(8)}`
}

export function sanitizeApiKey(record: ApiKeyRecord): SanitizedApiKey {
  let status: 'active' | 'expired' | 'revoked' = 'active'
  if (record.revokedAt) {
    status = 'revoked'
  } else if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
    status = 'expired'
  }

  return {
    id: record.id,
    name: record.name,
    keyPrefix: record.keyPrefix,
    scopes: [...record.scopes],
    tier: record.tier,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    lastUsedAt: record.lastUsedAt,
    requestCount: record.requestCount,
    status,
  }
}

/**
 * Create a new service API key.
 * Stores only the SHA-256 hash and returns the plaintext key ONCE.
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
  const name = input.name?.trim()
  if (!name) {
    throw new Error('API key name is required')
  }

  const rawKey = generateKeySecret()
  const keyPrefix = `${rawKey.slice(0, 14)}...`
  const hashedKey = hashKey(rawKey)
  const id = generateKeyId()
  const createdAt = new Date().toISOString()
  const tier: ApiKeyTier = input.tier ?? 'free'

  const record: ApiKeyRecord = {
    id,
    name,
    keyPrefix,
    hashedKey,
    scopes: Array.isArray(input.scopes) ? input.scopes : [],
    tier,
    createdAt,
    expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
    revokedAt: null,
    lastUsedAt: null,
    requestCount: 0,
  }

  getKeyStore().set(id, record)

  return {
    id,
    key: rawKey,
    name,
    keyPrefix,
    scopes: record.scopes,
    tier,
    expiresAt: record.expiresAt,
    createdAt,
  }
}

/**
 * List all API keys in sanitized format (no hashes or secrets).
 */
export async function listApiKeys(): Promise<SanitizedApiKey[]> {
  const store = getKeyStore()
  const results: SanitizedApiKey[] = []
  for (const record of store.values()) {
    results.push(sanitizeApiKey(record))
  }
  return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

/**
 * Retrieve raw key record by ID (for internal/test use).
 */
export function getApiKeyRecord(id: string): ApiKeyRecord | undefined {
  return getKeyStore().get(id)
}

/**
 * Revoke an API key immediately.
 */
export async function revokeApiKey(id: string): Promise<boolean> {
  const store = getKeyStore()
  const record = store.get(id)
  if (!record || record.revokedAt) {
    return false
  }

  record.revokedAt = new Date().toISOString()
  store.set(id, record)
  return true
}

/**
 * Rotate an existing key: immediately replaces the hashed key and returns the new secret ONCE.
 */
export async function rotateApiKey(id: string): Promise<{ id: string; key: string; keyPrefix: string } | null> {
  const store = getKeyStore()
  const record = store.get(id)
  if (!record) {
    return null
  }

  const rawKey = generateKeySecret()
  const keyPrefix = `${rawKey.slice(0, 14)}...`
  const hashedKey = hashKey(rawKey)

  record.hashedKey = hashedKey
  record.keyPrefix = keyPrefix
  record.revokedAt = null // Reset revocation if rotated

  store.set(id, record)

  return {
    id: record.id,
    key: rawKey,
    keyPrefix,
  }
}

/**
 * Verify a provided API key against Admin API Key or stored scoped keys in constant time.
 */
export function verifyApiKey(providedKey: string): VerificationResult {
  const trimmedKey = providedKey?.trim()
  if (!trimmedKey) {
    return { valid: false, tier: 'no_key', scopes: [], isAdmin: false, error: 'missing_key' }
  }

  // 1. Check Admin Key
  try {
    const adminKey = getAdminApiKey()
    if (adminKey && timingSafeEqual(trimmedKey, adminKey)) {
      return {
        valid: true,
        tier: 'admin',
        scopes: ['*'],
        isAdmin: true,
      }
    }
  } catch {
    // In production without ADMIN_API_KEY, let it pass through to checking service keys
  }

  // 2. Check Service Keys via constant-time hash comparison
  const store = getKeyStore()
  const candidateHash = hashKey(trimmedKey)
  const now = Date.now()

  for (const record of store.values()) {
    if (timingSafeEqual(candidateHash, record.hashedKey)) {
      // Check if revoked
      if (record.revokedAt) {
        return { valid: false, tier: record.tier, scopes: [], isAdmin: false, error: 'key_revoked' }
      }

      // Check if expired
      if (record.expiresAt && new Date(record.expiresAt).getTime() <= now) {
        return { valid: false, tier: record.tier, scopes: [], isAdmin: false, error: 'key_expired' }
      }

      // Key is valid - update metadata
      record.lastUsedAt = new Date().toISOString()
      record.requestCount += 1
      store.set(record.id, record)

      return {
        valid: true,
        record,
        tier: record.tier,
        scopes: [...record.scopes],
        isAdmin: record.tier === 'admin' || record.scopes.includes('*') || record.scopes.includes('admin'),
      }
    }
  }

  return { valid: false, tier: 'no_key', scopes: [], isAdmin: false, error: 'invalid_key' }
}

/**
 * Sliding window rate limiting
 * Tier limits:
 * - no_key: 10 requests / min
 * - free: 60 requests / min
 * - pro: 600 requests / min
 * - admin: unlimited
 */
export const TIER_RATE_LIMITS: Record<ApiKeyTier, number> = {
  no_key: 10,
  free: 60,
  pro: 600,
  admin: Number.POSITIVE_INFINITY,
}

export function checkTierRateLimit(
  identifier: string,
  tier: ApiKeyTier,
  windowMs = 60_000,
): RateLimitStatus {
  const maxRequests = TIER_RATE_LIMITS[tier]
  const now = Date.now()

  if (tier === 'admin' || maxRequests === Number.POSITIVE_INFINITY) {
    return {
      allowed: true,
      tier,
      limit: 'unlimited',
      remaining: 'unlimited',
      retryAfterSeconds: 0,
      resetTimeMs: now + windowMs,
    }
  }

  const store = getRateLimitStore()
  const key = `ratelimit:${tier}:${identifier}`
  const windowStart = now - windowMs

  let timestamps = store.get(key)
  if (!timestamps) {
    timestamps = []
    store.set(key, timestamps)
  }

  // Filter timestamps outside the sliding window
  while (timestamps.length > 0 && timestamps[0]! < windowStart) {
    timestamps.shift()
  }

  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0]!
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000)
    return {
      allowed: false,
      tier,
      limit: maxRequests,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfter),
      resetTimeMs: oldest + windowMs,
    }
  }

  timestamps.push(now)
  return {
    allowed: true,
    tier,
    limit: maxRequests,
    remaining: maxRequests - timestamps.length,
    retryAfterSeconds: 0,
    resetTimeMs: now + windowMs,
  }
}
