import { getAdminApiKey } from "@/lib/admin-api-key";
import { readPersistedKeys, writePersistedKeys } from "./storage";

export type ApiKeyTier = "no_key" | "free" | "pro" | "admin";

export type ApiKeyStatus = "active" | "revoked" | "expired";

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  hashedKey: string;
  scopes: string[];
  tier: ApiKeyTier;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  requestCount: number;
}

export interface SanitizedApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  tier: ApiKeyTier;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  status: ApiKeyStatus;
}

export interface CreateApiKeyInput {
  name: string;
  scopes?: string[];
  tier?: ApiKeyTier;
  expiresAt?: string | null;
}

export interface CreateApiKeyResult {
  id: string;
  key: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  tier: ApiKeyTier;
  expiresAt: string | null;
  createdAt: string;
}

export interface VerificationResult {
  valid: boolean;
  record?: ApiKeyRecord;
  tier: ApiKeyTier;
  scopes: string[];
  isAdmin: boolean;
  error?: "missing_key" | "invalid_key" | "key_revoked" | "key_expired";
}

export interface RateLimitStatus {
  allowed: boolean;
  tier: ApiKeyTier;
  limit: number | "unlimited";
  remaining: number | "unlimited";
  retryAfterSeconds: number;
  resetTimeMs: number;
}

// Global state container compatible with Next.js HMR and Node runtime
interface ApiKeyGlobalStore {
  __openStellarApiKeys__?: Map<string, ApiKeyRecord>;
  __openStellarRateLimits__?: Map<string, number[]>;
}

const globalStore = globalThis as typeof globalThis & ApiKeyGlobalStore;

let persistTimer: NodeJS.Timeout | null = null;

/**
 * Schedules an asynchronous, debounced flush of lastUsedAt / requestCount
 * updates to disk. Security-critical mutations (create / revoke / rotate)
 * always call persistKeyStoreImmediate() and are unaffected by this timer.
 *
 * Trade-off: in serverless deployments the invocation may be frozen before
 * the 200 ms window elapses, causing in-flight counter updates to be lost.
 * Set `FLUSH_USAGE_SYNC=true` in your environment to force synchronous writes
 * on every authenticated request when accurate usage accounting is required.
 */
export function schedulePersistKeyStore(delayMs = 200): void {
  // Opt-in synchronous flush for environments requiring accurate usage counters.
  if (process.env.FLUSH_USAGE_SYNC === "true") {
    persistKeyStoreImmediate();
    return;
  }

  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const store = getKeyStore();
      writePersistedKeys(Array.from(store.values()));
    } catch {
      // Background persistence errors are non-fatal.
    }
  }, delayMs);
  if (typeof persistTimer?.unref === "function") {
    persistTimer.unref();
  }
}

export function getKeyStore(): Map<string, ApiKeyRecord> {
  if (!globalStore.__openStellarApiKeys__) {
    const store = new Map<string, ApiKeyRecord>();
    const persisted = readPersistedKeys();
    for (const record of persisted) {
      if (record?.id) {
        store.set(record.id, record);
      }
    }
    globalStore.__openStellarApiKeys__ = store;
  }
  return globalStore.__openStellarApiKeys__;
}

export function persistKeyStoreImmediate(): void {
  const store = getKeyStore();
  writePersistedKeys(Array.from(store.values()));
}

function getRateLimitStore(): Map<string, number[]> {
  globalStore.__openStellarRateLimits__ ??= new Map<string, number[]>();
  return globalStore.__openStellarRateLimits__;
}

/**
 * Resets stores for test isolation and clears persisted files.
 */
export function resetApiKeyStore(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const store = getKeyStore();
  store.clear();
  persistKeyStoreImmediate();
  const rateLimitStore = getRateLimitStore();
  rateLimitStore.clear();
}

/**
 * Generates a CSPRNG random hex string of given byte length.
 */
export function generateRandomHex(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generates a new raw secret key and its display prefix.
 * Format: osk_live_<48-hex>
 */
export function generateKeySecret(): { secret: string; prefix: string } {
  const hex = generateRandomHex(24);
  const secret = `osk_live_${hex}`;
  const prefix = `${secret.slice(0, 14)}...`;
  return { secret, prefix };
}

/**
 * Hashes a secret key using standard SHA-256 via Web Crypto API.
 * Fails closed if Web Crypto subtle digest is unavailable.
 */
export async function hashKey(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);

  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle?.digest) {
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  }

  throw new Error(
    "Web Crypto subtle.digest unavailable; cannot securely hash key",
  );
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  let diff = bufA.length ^ bufB.length;
  const maxLen = Math.max(bufA.length, bufB.length);

  for (let i = 0; i < maxLen; i++) {
    const byteA = i < bufA.length ? bufA[i]! : 0;
    const byteB = i < bufB.length ? bufB[i]! : 0;
    diff |= byteA ^ byteB;
  }

  return diff === 0;
}

/**
 * Computes status of a key record.
 */
export function calculateKeyStatus(record: ApiKeyRecord): ApiKeyStatus {
  if (record.revokedAt) {
    return "revoked";
  }
  if (record.expiresAt) {
    const expiryTime = new Date(record.expiresAt).getTime();
    if (!Number.isNaN(expiryTime) && expiryTime <= Date.now()) {
      return "expired";
    }
  }
  return "active";
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
  };
}

/**
 * Issues a new API key and stores its SHA-256 hash.
 * Plaintext secret is returned ONLY once in the result.
 */
export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> {
  const name = input.name?.trim();
  if (!name) {
    throw new Error("Key name is required");
  }

  const { secret, prefix } = generateKeySecret();
  const hashed = await hashKey(secret);
  const id = `key_${generateRandomHex(8)}`;
  const now = new Date().toISOString();
  const tier: ApiKeyTier = input.tier || "free";

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
  };

  const store = getKeyStore();
  store.set(id, record);
  persistKeyStoreImmediate();

  return {
    id,
    key: secret,
    name,
    keyPrefix: prefix,
    scopes: record.scopes,
    tier,
    expiresAt: record.expiresAt,
    createdAt: now,
  };
}

/**
 * Lists all API keys in sanitized format.
 */
export async function listApiKeys(): Promise<SanitizedApiKey[]> {
  const store = getKeyStore();
  const list: SanitizedApiKey[] = [];

  for (const record of store.values()) {
    list.push(sanitizeApiKey(record));
  }

  return list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Internal lookup for test verification of hashed storage.
 */
export function getApiKeyRecord(id: string): ApiKeyRecord | undefined {
  return getKeyStore().get(id);
}

/**
 * Revokes an existing API key immediately.
 */
export async function revokeApiKey(id: string): Promise<boolean> {
  const store = getKeyStore();
  const record = store.get(id);
  if (!record) {
    return false;
  }

  record.revokedAt = new Date().toISOString();
  store.set(id, record);
  persistKeyStoreImmediate();
  return true;
}

/**
 * Rotates an existing key's secret.
 * Replaces the stored hash with a new secret hash, invalidating the previous secret immediately.
 */
export async function rotateApiKey(
  id: string,
): Promise<{ id: string; key: string; keyPrefix: string } | null> {
  const store = getKeyStore();
  const record = store.get(id);
  if (!record) {
    return null;
  }

  if (record.revokedAt) {
    throw new Error(
      "Cannot rotate a revoked API key. Issue a new key instead.",
    );
  }

  const { secret: rawKey, prefix: keyPrefix } = generateKeySecret();
  const newHashedKey = await hashKey(rawKey);

  record.hashedKey = newHashedKey;
  record.keyPrefix = keyPrefix;
  record.requestCount = 0;
  record.lastUsedAt = null;

  store.set(id, record);
  persistKeyStoreImmediate();

  return {
    id,
    key: rawKey,
    keyPrefix,
  };
}

function verifyAdminKey(trimmedKey: string): VerificationResult | null {
  try {
    const adminKey = getAdminApiKey();
    if (adminKey && timingSafeEqual(trimmedKey, adminKey)) {
      return {
        valid: true,
        tier: "admin",
        scopes: ["*"],
        isAdmin: true,
      };
    }
  } catch {
    // In production without ADMIN_API_KEY, fallback to service keys
  }
  return null;
}

function findRecordByHash(candidateHash: string): ApiKeyRecord | undefined {
  const store = getKeyStore();
  for (const record of store.values()) {
    if (timingSafeEqual(candidateHash, record.hashedKey)) {
      return record;
    }
  }
  return undefined;
}

function validateMatchedRecord(
  matchedRecord: ApiKeyRecord,
  now: number,
): VerificationResult {
  if (matchedRecord.revokedAt) {
    return {
      valid: false,
      tier: matchedRecord.tier,
      scopes: [],
      isAdmin: false,
      error: "key_revoked",
    };
  }

  if (
    matchedRecord.expiresAt &&
    new Date(matchedRecord.expiresAt).getTime() <= now
  ) {
    return {
      valid: false,
      tier: matchedRecord.tier,
      scopes: [],
      isAdmin: false,
      error: "key_expired",
    };
  }

  matchedRecord.lastUsedAt = new Date().toISOString();
  matchedRecord.requestCount += 1;
  // Asynchronously schedule persistence without blocking the request hot path
  schedulePersistKeyStore();

  return {
    valid: true,
    record: matchedRecord,
    tier: matchedRecord.tier,
    scopes: [...matchedRecord.scopes],
    isAdmin:
      matchedRecord.tier === "admin" ||
      matchedRecord.scopes.includes("*") ||
      matchedRecord.scopes.includes("admin"),
  };
}

/**
 * Verify a provided API key against Admin API Key or stored scoped keys in constant time.
 */
export async function verifyApiKey(
  providedKey: string,
): Promise<VerificationResult> {
  const trimmedKey = providedKey?.trim();
  if (!trimmedKey) {
    return {
      valid: false,
      tier: "no_key",
      scopes: [],
      isAdmin: false,
      error: "missing_key",
    };
  }

  const adminResult = verifyAdminKey(trimmedKey);
  if (adminResult) {
    return adminResult;
  }

  const candidateHash = await hashKey(trimmedKey);
  const matchedRecord = findRecordByHash(candidateHash);

  if (matchedRecord) {
    return validateMatchedRecord(matchedRecord, Date.now());
  }

  return {
    valid: false,
    tier: "no_key",
    scopes: [],
    isAdmin: false,
    error: "invalid_key",
  };
}

export const TIER_RATE_LIMITS: Record<ApiKeyTier, number> = {
  no_key: 10,
  free: 60,
  pro: 600,
  admin: Number.POSITIVE_INFINITY,
};

export function checkTierRateLimit(
  identifier: string,
  tier: ApiKeyTier,
  windowMs = 60_000,
): RateLimitStatus {
  const maxRequests = TIER_RATE_LIMITS[tier];
  const now = Date.now();

  if (tier === "admin" || maxRequests === Number.POSITIVE_INFINITY) {
    return {
      allowed: true,
      tier,
      limit: "unlimited",
      remaining: "unlimited",
      retryAfterSeconds: 0,
      resetTimeMs: now + windowMs,
    };
  }

  const store = getRateLimitStore();
  const key = `ratelimit:${tier}:${identifier}`;
  const windowStart = now - windowMs;

  let timestamps = store.get(key);
  if (!timestamps) {
    timestamps = [];
    store.set(key, timestamps);
  }

  while (timestamps.length > 0 && timestamps[0]! < windowStart) {
    timestamps.shift();
  }

  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0]!;
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    return {
      allowed: false,
      tier,
      limit: maxRequests,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfter),
      resetTimeMs: oldest + windowMs,
    };
  }

  timestamps.push(now);
  return {
    allowed: true,
    tier,
    limit: maxRequests,
    remaining: maxRequests - timestamps.length,
    retryAfterSeconds: 0,
    resetTimeMs: now + windowMs,
  };
}
