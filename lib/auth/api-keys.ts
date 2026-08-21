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
  __openStellarStoreInitialized__?: boolean
}

function tryReadDiskStore(): ApiKeyRecord[] | null {
  try {
    if (typeof process !== 'undefined' && process.versions?.node) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path')
      const filePath = path.join(process.cwd(), '.data', 'api-keys.json')
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8').trim()
        if (content) {
          const parsed = JSON.parse(content) as unknown
          if (Array.isArray(parsed)) {
            return parsed as ApiKeyRecord[]
          }
        }
      }
    }
  } catch {
    // Ignore in non-Node or read-only edge environments
  }
  return null
}

function tryWriteDiskStore(records: ApiKeyRecord[]): void {
  try {
    if (typeof process !== 'undefined' && process.versions?.node) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path')
      const filePath = path.join(process.cwd(), '.data', 'api-keys.json')
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8')
    }
  } catch {
    // Ignore in non-Node or read-only edge environments
  }
}

function getKeyStore(): Map<string, ApiKeyRecord> {
  if (!globalState.__openStellarApiKeyStore__) {
    globalState.__openStellarApiKeyStore__ = new Map<string, ApiKeyRecord>()
  }

  if (!globalState.__openStellarStoreInitialized__) {
    globalState.__openStellarStoreInitialized__ = true
    const diskRecords = tryReadDiskStore()
    if (diskRecords && Array.isArray(diskRecords)) {
      for (const rec of diskRecords) {
        if (rec && rec.id) {
          globalState.__openStellarApiKeyStore__.set(rec.id, rec)
        }
      }
    }
  }

  return globalState.__openStellarApiKeyStore__
}

function saveKeyStore(): void {
  const store = getKeyStore()
  const records = Array.from(store.values())
  tryWriteDiskStore(records)
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
  globalState.__openStellarStoreInitialized__ = true
  tryWriteDiskStore([])
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
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Standard Web Crypto SHA-256 implementation (Node 18+, Edge Runtime, Browser).
 * Correctly processes all Unicode strings and satisfies cryptographic standards.
 */
export async function hashKey(secret: string): Promise<string> {
  if (typeof secret !== 'string') return ''
  const encoder = new TextEncoder()
  const data = encoder.encode(secret)
  
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  // Node runtime fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto')
    return crypto.createHash('sha256').update(secret, 'utf8').digest('hex')
  } catch {
    throw new Error('Web Crypto API is not available in this runtime.')
  }
}

/**
 * Constant-time comparison between two strings to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const encoder = new TextEncoder()
  const bufA = encoder.encode(a)
  const bufB = encoder.encode(b)

  if (bufA.length !== bufB.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i]! ^ bufB[i]!
  }
  return result === 0
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
 * Format: osk_live_<48_hex_chars>
 */
export function generateKeySecret(): { secret: string; prefix: string } {
  const randomHex = generateRandomHex(24)
  const secret = `osk_live_${randomHex}`
  const prefix = `osk_live_${randomHex.slice(0, 5)}...`
  return { secret, prefix }
}

/**
 * Derives a key status based on revocation and expiration timestamp.
 */
export function calculateKeyStatus(record: ApiKeyRecord): 'active' | 'expired' | 'revoked' {
  if (record.revokedAt) {
    return 'revoked'
  }
  if (record.expiresAt) {
    const expiryTime = new Date(record.expiresAt).getTime()
    if (!Number.isNaN(expiryTime) && expiryTime <= Date.now()) {
      return 'expired'
    }
  }
  return 'active'
}

/**
 * Sanitizes an ApiKeyRecord to strip the internal hashedKey.
 */
export function sanitizeApiKey(record: ApiKeyRecord): SanitizedApiKey {
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
    status: calculateKeyStatus(record),
  }
}

/**
 * Issues a new API key and stores its SHA-256 hash.
 * Plaintext secret is returned ONLY once in the result.
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
  const name = input.name?.trim()
  if (!name) {
    throw new Error('Key name is required')
  }

  const { secret, prefix } = generateKeySecret()
  const hashed = await hashKey(secret)
  const id = `key_${generateRandomHex(8)}`
  const now = new Date().toISOString()
  const tier: ApiKeyTier = input.tier || 'free'

  const record: ApiKeyRecord = {
    id,
    name,
    keyPrefix: prefix,
    hashedKey: hashed,
    scopes: Array.isArray(input.scopes) ? [...input.scopes] : [],
    tier,
    createdAt: now,
    expiresAt: input.expiresAt || null,
    revokedAt: null,
    lastUsedAt: null,
    requestCount: 0,
  }

  const store = getKeyStore()
  store.set(id, record)
  saveKeyStore()

  return {
    id,
    key: secret,
    name,
    keyPrefix: prefix,
    scopes: record.scopes,
    tier,
    expiresAt: record.expiresAt,
    createdAt: now,
  }
}

/**
 * Lists all API keys in sanitized format.
 */
export async function listApiKeys(): Promise<SanitizedApiKey[]> {
  const store = getKeyStore()
  const list: SanitizedApiKey[] = []

  for (const record of store.values()) {
    list.push(sanitizeApiKey(record))
  }

  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

/**
 * Internal lookup for test verification of hashed storage.
 */
export function getApiKeyRecord(id: string): ApiKeyRecord | undefined {
  return getKeyStore().get(id)
}

/**
 * Revokes an existing API key immediately.
 */
export async function revokeApiKey(id: string): Promise<boolean> {
  const store = getKeyStore()
  const record = store.get(id)
  if (!record) {
    return false
  }

  record.revokedAt = new Date().toISOString()
  store.set(id, record)
  saveKeyStore()
  return true
}

/**
 * Rotates an existing key's secret.
 * Replaces the stored hash with a new secret hash, invalidating the previous secret immediately.
 * Throws an error if the key is already revoked to prevent resurrecting intentionally revoked keys.
 */
export async function rotateApiKey(
  id: string,
): Promise<{ id: string; key: string; keyPrefix: string } | null> {
  const store = getKeyStore()
  const record = store.get(id)
  if (!record) {
    return null
  }

  if (record.revokedAt) {
    throw new Error('Cannot rotate a revoked API key. Issue a new key instead.')
  }

  const { secret: rawKey, prefix: keyPrefix } = generateKeySecret()
  const newHashedKey = await hashKey(rawKey)

  record.hashedKey = newHashedKey
  record.keyPrefix = keyPrefix
  record.requestCount = 0
  record.lastUsedAt = null

  store.set(id, record)
  saveKeyStore()

  return {
    id,
    key: rawKey,
    keyPrefix,
  }
}

/**
 * Verify a provided API key against Admin API Key or stored scoped keys in constant time.
 */
export async function verifyApiKey(providedKey: string): Promise<VerificationResult> {
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
  const candidateHash = await hashKey(trimmedKey)
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
      saveKeyStore()

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
 * - no_key: 60 requests / min (public anonymous)
 * - free: 60 requests / min
 * - pro: 600 requests / min
 * - admin: unlimited
 */
export const TIER_RATE_LIMITS: Record<ApiKeyTier, number> = {
  no_key: 60,
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
