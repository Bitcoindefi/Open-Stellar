import { describe, expect, it } from "vitest"
import { WALLET_LIMITS, balanceLimits, fundLimits, takeLimits, withdrawLimits } from "@/lib/agent-wallet/limits"
import { getFeePayerSigner, parseSecretKey } from "@/lib/agent-wallet/fee-payer"
import { createMemoryStore, type KvStore } from "@/lib/security/kv-store"

const now = new Date("2026-10-02T10:30:00Z")

describe("wallet rate limits", () => {
  it("allows up to the limit per browser, then refuses without using up other windows", async () => {
    const store = createMemoryStore()
    for (let i = 0; i < WALLET_LIMITS.withdrawPerBrowserPerHour; i++) expect(await takeLimits(store, withdrawLimits("u1", now))).toEqual({ ok: true })
    const refused = await takeLimits(store, withdrawLimits("u1", now))
    expect(refused).toMatchObject({ ok: false, key: expect.stringContaining("withdraw:u1") })
    // The refused attempt gave back its global count; another browser is unaffected.
    expect(await store.get(`agent-wallet:withdraw:global:2026-10-02`)).toBe(String(WALLET_LIMITS.withdrawPerBrowserPerHour))
    expect(await takeLimits(store, withdrawLimits("u2", now))).toEqual({ ok: true })
    // A new hour opens a new window.
    expect(await takeLimits(store, withdrawLimits("u1", new Date("2026-10-02T11:00:01Z")))).toEqual({ ok: true })
  })

  it("caps withdrawals globally per day", async () => {
    const store = createMemoryStore()
    for (let i = 0; i < WALLET_LIMITS.withdrawGlobalPerDay; i++) await store.incr("agent-wallet:withdraw:global:2026-10-02", 60)
    expect(await takeLimits(store, withdrawLimits("u9", now))).toMatchObject({ ok: false, key: "agent-wallet:withdraw:global:2026-10-02" })
    expect(await store.get(`agent-wallet:withdraw:u9:${Math.floor(now.getTime() / 3_600_000)}`)).toBe("0")
  })

  it("bounds sponsored funding per browser, per IP (hashed) and globally", async () => {
    const store = createMemoryStore()
    const limits = fundLimits("u1", "203.0.113.5", now)
    expect(limits.map((limit) => limit.max)).toEqual([WALLET_LIMITS.fundPerBrowserPerHour, WALLET_LIMITS.fundPerIpPerDay, WALLET_LIMITS.fundGlobalPerDay])
    expect(limits[1].key).not.toContain("203.0.113.5")
    expect(fundLimits("u1", null, now)).toHaveLength(2)
    for (let i = 0; i < WALLET_LIMITS.fundPerBrowserPerHour; i++) expect((await takeLimits(store, limits)).ok).toBe(true)
    expect((await takeLimits(store, limits)).ok).toBe(false)
    for (let i = 0; i < WALLET_LIMITS.fundPerIpPerDay - WALLET_LIMITS.fundPerBrowserPerHour; i++) await takeLimits(store, fundLimits(`other-${i}`, "203.0.113.5", now))
    expect(await takeLimits(store, fundLimits("fresh", "203.0.113.5", now))).toMatchObject({ ok: false, key: limits[1].key })
  })

  it("bounds balance reads per minute", async () => {
    const store = createMemoryStore()
    for (let i = 0; i < WALLET_LIMITS.balancePerBrowserPerMinute; i++) await takeLimits(store, balanceLimits("u1", now))
    expect((await takeLimits(store, balanceLimits("u1", now))).ok).toBe(false)
  })

  it("propagates store errors so money routes fail closed", async () => {
    const broken: KvStore = { ...createMemoryStore(), incr: async () => { throw new Error("KV down") } }
    await expect(takeLimits(broken, withdrawLimits("u1", now))).rejects.toThrow("KV down")
  })
})

describe("fee payer", () => {
  it("accepts only a 64-byte JSON array", () => {
    expect(parseSecretKey(undefined)).toBeNull()
    expect(parseSecretKey("  ")).toBeNull()
    expect(parseSecretKey("not json")).toBeNull()
    expect(parseSecretKey("[1,2,3]")).toBeNull()
    expect(parseSecretKey(JSON.stringify(Array(64).fill(256)))).toBeNull()
    expect(parseSecretKey(JSON.stringify(Array(64).fill(1)))).toHaveLength(64)
  })

  it("loads the server keypair, or nothing", async () => {
    const { generateKeyPairSync } = await import("node:crypto")
    const { privateKey, publicKey } = generateKeyPairSync("ed25519")
    const d = Buffer.from(privateKey.export({ format: "jwk" }).d as string, "base64url")
    const x = Buffer.from(publicKey.export({ format: "jwk" }).x as string, "base64url")
    const signer = await getFeePayerSigner({ SOLANA_SERVER_SECRET: JSON.stringify(Array.from(Buffer.concat([d, x]))) })
    expect(signer?.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    expect(await getFeePayerSigner({})).toBeNull()
    // 64 bytes whose public half does not match the private half.
    expect(await getFeePayerSigner({ SOLANA_SERVER_SECRET: JSON.stringify(Array(64).fill(1)) })).toBeNull()
  })
})
