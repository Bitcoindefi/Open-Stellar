import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
  verifyApiKey,
  hashKey,
  timingSafeEqual,
  checkTierRateLimit,
  resetApiKeyStore,
  getApiKeyRecord,
} from "@/lib/auth/api-keys";
import { evaluateAuth, getClientIp } from "@/lib/auth/middleware";

async function testAuth(
  path: string,
  options?: {
    method?: string;
    key?: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
) {
  const headers: Record<string, string> = { ...(options?.headers || {}) };
  if (options?.key) {
    headers.Authorization = `Bearer ${options.key}`;
  }
  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }

  const req = new Request(`http://localhost:3000${path}`, {
    method: options?.method || "GET",
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  return evaluateAuth(req);
}

describe("API Key Authentication and Zero-Trust Protection", () => {
  beforeEach(() => {
    resetApiKeyStore();
    delete process.env.DEV_MODE;
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    process.env.ADMIN_API_KEY = "osk_admin_live_testsecretkey999";
  });

  it("rejects protected admin routes without an API key with 401", async () => {
    const result = await testAuth("/admin");
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toMatch(/Admin API key required/i);
  });

  it("rejects agent write operations without an API key with 401", async () => {
    const result = await testAuth("/api/agents", {
      method: "POST",
      body: { name: "unauthorized-agent" },
    });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
  });

  it("rejects requests with an invalid or malformed API key with 401", async () => {
    const result = await testAuth("/admin", {
      key: "osk_live_invalid_nonexistent_key_12345",
    });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toMatch(/Invalid or revoked API key/i);
  });

  it("allows access to admin routes when a valid ADMIN_API_KEY is provided", async () => {
    const result = await testAuth("/admin", {
      key: "osk_admin_live_testsecretkey999",
    });
    expect(result.allowed).toBe(true);
    expect(result.status).toBe(200);
    expect(result.isAdmin).toBe(true);
    expect(result.tier).toBe("admin");
  });

  it("allows access via x-api-key custom header", async () => {
    const created = await createApiKey({
      name: "custom-header-client",
      scopes: ["agents:write"],
    });

    const result = await testAuth("/api/agents", {
      method: "POST",
      headers: { "x-api-key": created.key },
      body: { name: "header-client-agent" },
    });
    expect(result.allowed).toBe(true);
    expect(result.status).toBe(200);
  });

  it("strictly enforces closed authentication in production even if DEV_MODE=true", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.DEV_MODE = "true";

    const result = await testAuth("/admin");
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
  });

  it("immediately denies access when a scoped API key is revoked", async () => {
    const created = await createApiKey({
      name: "temporary-agent-worker",
      scopes: ["agents:write"],
      tier: "free",
    });

    const beforeRevocation = await testAuth("/api/agents", {
      method: "POST",
      key: created.key,
      body: { name: "active-agent" },
    });
    expect(beforeRevocation.allowed).toBe(true);

    const revoked = await revokeApiKey(created.id);
    expect(revoked).toBe(true);

    const afterRevocation = await testAuth("/api/agents", {
      method: "POST",
      key: created.key,
      body: { name: "active-agent" },
    });
    expect(afterRevocation.allowed).toBe(false);
    expect(afterRevocation.status).toBe(401);
  });

  it("allows access to allowed scope and rejects non-allowed scope with 403", async () => {
    const scopedKey = await createApiKey({
      name: "telemetry-only-worker",
      scopes: ["agents:write"],
      tier: "free",
    });

    const allowedOp = await testAuth("/api/agents", {
      method: "POST",
      key: scopedKey.key,
      body: { name: "bot-1" },
    });
    expect(allowedOp.allowed).toBe(true);

    const forbiddenOp = await testAuth("/api/webhooks", {
      method: "POST",
      key: scopedKey.key,
      body: { url: "https://example.com" },
    });
    expect(forbiddenOp.allowed).toBe(false);
    expect(forbiddenOp.status).toBe(403);
    expect(forbiddenOp.error).toMatch(/Missing required scope webhooks:manage/i);
  });

  it("enforces sliding-window rate limit and returns 429 with Retry-After and headers", async () => {
    const testIp = "203.0.113.42";

    for (let i = 0; i < 10; i++) {
      const allowed = checkTierRateLimit(testIp, "no_key", 60_000);
      expect(allowed.allowed).toBe(true);
    }

    const blocked = checkTierRateLimit(testIp, "no_key", 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    const req = new Request("http://localhost:3000/api/feed", {
      headers: { "cf-connecting-ip": testIp },
    });
    const result = await evaluateAuth(req);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(429);
    expect(result.headers?.["Retry-After"]).toBeDefined();
    expect(result.headers?.["X-RateLimit-Limit"]).toBe("10");
  });

  it("emits X-RateLimit headers on successful responses", async () => {
    const created = await createApiKey({
      name: "header-test-client",
      tier: "free",
    });

    const result = await testAuth("/api/feed", {
      key: created.key,
    });
    expect(result.allowed).toBe(true);
    expect(result.headers?.["X-RateLimit-Limit"]).toBe("60");
    expect(result.headers?.["X-RateLimit-Remaining"]).toBeDefined();
    expect(result.headers?.["X-RateLimit-Reset"]).toBeDefined();
    expect(result.headers?.["X-Api-Tier"]).toBe("free");
  });

  describe("getClientIp — IP normalisation and XFF strategies", () => {
    afterEach(() => {
      delete process.env.TRUSTED_PROXY_COUNT;
    });

    it("extracts real client IP by skipping internal proxy hops (best-effort)", () => {
      const req = new Request("http://localhost:3000/api/feed", {
        headers: { "x-forwarded-for": "198.51.100.22, 10.0.0.1, 127.0.0.1" },
      });
      expect(getClientIp(req)).toBe("198.51.100.22");
    });

    it("normalises uppercase IPv6 loopback (FE80::1) as private and skips it", () => {
      const req = new Request("http://localhost:3000/api/feed", {
        headers: {
          "x-forwarded-for": "203.0.113.5, FE80::1",
        },
      });
      expect(getClientIp(req)).toBe("203.0.113.5");
    });

    it("normalises bracket+port IPv6 loopback ([::1]:80) as private and skips it", () => {
      const req = new Request("http://localhost:3000/api/feed", {
        headers: {
          "x-forwarded-for": "198.51.100.99, [::1]:80",
        },
      });
      expect(getClientIp(req)).toBe("198.51.100.99");
    });

    it("normalises IPv4+port suffix (127.0.0.1:8080) as loopback and skips it", () => {
      const req = new Request("http://localhost:3000/api/feed", {
        headers: {
          "x-forwarded-for": "203.0.113.10, 127.0.0.1:8080",
        },
      });
      expect(getClientIp(req)).toBe("203.0.113.10");
    });

    it("uses TRUSTED_PROXY_COUNT to take the correct XFF hop on known infrastructure", () => {
      process.env.TRUSTED_PROXY_COUNT = "2";
      // Chain: [client, middle-proxy, infra-proxy-1, infra-proxy-2]
      // With TRUSTED_PROXY_COUNT=2, skip rightmost 2 → index = 4-1-2 = 1 = "10.20.30.40"
      const req = new Request("http://localhost:3000/api/feed", {
        headers: {
          "x-forwarded-for":
            "203.0.113.77, 10.20.30.40, 192.168.1.1, 10.0.0.2",
        },
      });
      expect(getClientIp(req)).toBe("10.20.30.40");
    });
  });

  it("stores only SHA-256 hashes and does not persist raw plaintext secrets", async () => {
    const created = await createApiKey({
      name: "production-payment-relay",
      scopes: ["x402:quote", "x402:settle"],
      tier: "pro",
    });

    const record = getApiKeyRecord(created.id);
    expect(record).toBeDefined();
    expect(record?.hashedKey).toBeDefined();
    expect(record?.hashedKey).toHaveLength(64);
    expect(record?.hashedKey).not.toContain(created.key);

    const expectedHash = await hashKey(created.key);
    expect(record?.hashedKey).toBe(expectedHash);

    const publicList = await listApiKeys();
    const publicRecord = publicList.find((k) => k.id === created.id);
    expect(publicRecord).toBeDefined();
    expect(
      (publicRecord as unknown as Record<string, unknown>).hashedKey,
    ).toBeUndefined();
    expect(
      (publicRecord as unknown as Record<string, unknown>).key,
    ).toBeUndefined();
    expect(publicRecord?.keyPrefix).toMatch(/^osk_live_/);
  });

  it("rotates an API key, invalidating old secret and activating new secret", async () => {
    const original = await createApiKey({
      name: "rotatable-key",
      scopes: ["agents:write"],
    });

    const initialAuth = await verifyApiKey(original.key);
    expect(initialAuth.valid).toBe(true);

    const rotated = await rotateApiKey(original.id);
    expect(rotated).not.toBeNull();
    expect(rotated?.key).not.toBe(original.key);

    const oldKeyAuth = await verifyApiKey(original.key);
    expect(oldKeyAuth.valid).toBe(false);

    const newKeyAuth = await verifyApiKey(rotated!.key);
    expect(newKeyAuth.valid).toBe(true);
  });

  it("throws an error when attempting to rotate a revoked key", async () => {
    const key = await createApiKey({
      name: "to-be-revoked",
      scopes: ["agents:write"],
    });

    await revokeApiKey(key.id);
    await expect(rotateApiKey(key.id)).rejects.toThrow(
      /Cannot rotate a revoked API key/i,
    );
  });

  it("performs constant-time comparisons securely", () => {
    expect(timingSafeEqual("correct_secret_hash", "correct_secret_hash")).toBe(
      true,
    );
    expect(timingSafeEqual("correct_secret_hash", "wrong_secret_hash")).toBe(
      false,
    );
    expect(timingSafeEqual("short", "longer_string_here")).toBe(false);
  });

  it("persists created keys and reloads them across store invocations", async () => {
    const created = await createApiKey({
      name: "persisted-key-test",
      scopes: ["x402:quote"],
      tier: "pro",
    });

    const verified = await verifyApiKey(created.key);
    expect(verified.valid).toBe(true);
    expect(verified.record?.name).toBe("persisted-key-test");
  });
});
