import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createMemoryStore, setKvStoreForTests } from "@/lib/security/kv-store"
import { REGISTRATION_LIMITS, reserveRegistration } from "@/lib/solana/registration-quota"
import { claimPaymentReview, getPaymentAgent, recordAgentPayment, releasePaymentReview } from "@/lib/solana/payment-bindings"

const DAY = new Date("2026-10-01T12:00:00Z")

describe("registration quota", () => {
  beforeEach(() => setKvStoreForTests(createMemoryStore()))
  afterEach(() => setKvStoreForTests(null))

  it("caps registrations per owner per day and gives back released slots", async () => {
    const reservations = []
    for (let i = 0; i < REGISTRATION_LIMITS.perOwnerPerDay; i += 1) {
      const r = await reserveRegistration("owner-a", DAY)
      expect(r.ok).toBe(true)
      reservations.push(r)
    }
    expect(await reserveRegistration("owner-a", DAY)).toEqual({ ok: false, scope: "owner" })
    const first = reservations[0]
    if (first?.ok) {
      await first.release()
      await first.release() // idempotent
    }
    expect((await reserveRegistration("owner-a", DAY)).ok).toBe(true)
    expect(await reserveRegistration("owner-a", DAY)).toEqual({ ok: false, scope: "owner" })
    // A new day starts a new count.
    expect((await reserveRegistration("owner-a", new Date("2026-10-02T00:00:01Z"))).ok).toBe(true)
  })

  it("caps registrations globally without charging the owner", async () => {
    const owners = Math.ceil(REGISTRATION_LIMITS.globalPerDay / REGISTRATION_LIMITS.perOwnerPerDay)
    for (let o = 0; o < owners; o += 1) {
      for (let i = 0; i < REGISTRATION_LIMITS.perOwnerPerDay; i += 1) await reserveRegistration(`owner-${o}`, DAY)
    }
    expect(await reserveRegistration("late-owner", DAY)).toEqual({ ok: false, scope: "global" })
    expect(await reserveRegistration("late-owner", DAY)).toEqual({ ok: false, scope: "global" })
  })
})

describe("payment bindings", () => {
  beforeEach(() => setKvStoreForTests(createMemoryStore()))
  afterEach(() => setKvStoreForTests(null))

  it("binds a payment to the first agent and allows one review claim", async () => {
    expect(await recordAgentPayment("sig", "legacy/a")).toBe(true)
    expect(await recordAgentPayment("sig", "legacy/b")).toBe(false)
    expect(await recordAgentPayment("", "legacy/b")).toBe(false)
    expect(await getPaymentAgent("sig")).toBe("legacy/a")
    expect(await getPaymentAgent("")).toBeNull()
    expect(await claimPaymentReview("sig")).toBe(true)
    expect(await claimPaymentReview("sig")).toBe(false)
    await releasePaymentReview("sig")
    expect(await claimPaymentReview("sig")).toBe(true)
  })
})
