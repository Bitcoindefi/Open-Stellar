import { describe, expect, it } from "vitest"
import { createMemoryStore } from "@/lib/security/kv-store"
import { dayLedgerKey, microToUsdc, readCaps, releaseDaily, reserveDaily, spentToday, usdcToMicro } from "@/lib/orchestration/budget"

describe("usdc amounts", () => {
  it("parses prices and caps into micro-USDC", () => {
    expect(usdcToMicro("$0.01")).toBe(10_000)
    expect(usdcToMicro("0.05")).toBe(50_000)
    expect(usdcToMicro(0.5)).toBe(500_000)
    expect(usdcToMicro("2")).toBe(2_000_000)
    expect(usdcToMicro("1.000001")).toBe(1_000_001)
    for (const bad of ["", "abc", "-1", "0.0000001", "1e3"]) expect(usdcToMicro(bad)).toBeNull()
  })

  it("formats micro-USDC compactly", () => {
    expect(microToUsdc(10_000)).toBe("0.01")
    expect(microToUsdc(500_000)).toBe("0.5")
    expect(microToUsdc(2_000_000)).toBe("2")
    expect(microToUsdc(0)).toBe("0")
    expect(microToUsdc(-10_000)).toBe("-0.01")
  })
})

describe("readCaps", () => {
  it("uses the defaults the owner chose", () => {
    expect(readCaps({})).toEqual({ perRunMicro: 50_000, perDayMicro: 500_000, hardDayMicro: 2_000_000 })
  })

  it("reads env overrides and ignores invalid ones", () => {
    expect(readCaps({ ORCHESTRATOR_MAX_USDC_PER_RUN: "0.02", ORCHESTRATOR_MAX_USDC_PER_DAY: "1", ORCHESTRATOR_HARD_MAX_USDC_PER_DAY: "3" }))
      .toEqual({ perRunMicro: 20_000, perDayMicro: 1_000_000, hardDayMicro: 3_000_000 })
    expect(readCaps({ ORCHESTRATOR_MAX_USDC_PER_RUN: "lots" }).perRunMicro).toBe(50_000)
  })

  it("never lets the hard ceiling sit below the daily cap", () => {
    expect(readCaps({ ORCHESTRATOR_MAX_USDC_PER_DAY: "5", ORCHESTRATOR_HARD_MAX_USDC_PER_DAY: "1" }).hardDayMicro).toBe(5_000_000)
  })
})

describe("daily ledger", () => {
  const day = new Date("2026-10-01T12:00:00Z")

  it("reserves until the cap and refuses the hop that would cross it", async () => {
    const store = createMemoryStore()
    expect(dayLedgerKey("u1", day)).toBe("orchestrator:spend:u1:2026-10-01")
    expect(await reserveDaily(store, "u1", 10_000, 20_000, day)).toMatchObject({ ok: true })
    expect(await reserveDaily(store, "u1", 10_000, 20_000, day)).toMatchObject({ ok: true })
    expect(await reserveDaily(store, "u1", 10_000, 20_000, day)).toEqual({ ok: false, spentMicro: 20_000 })
    expect(await spentToday(store, "u1", day)).toBe(20_000)
  })

  it("keeps one ledger per browser", async () => {
    const store = createMemoryStore()
    await reserveDaily(store, "u1", 10_000, 10_000, day)
    expect(await reserveDaily(store, "u1", 10_000, 10_000, day)).toMatchObject({ ok: false })
    expect(await reserveDaily(store, "u2", 10_000, 10_000, day)).toMatchObject({ ok: true })
    expect(await spentToday(store, "u3", day)).toBe(0)
  })

  it("gives a reservation back when the payment did not happen", async () => {
    const store = createMemoryStore()
    const held = await reserveDaily(store, "u1", 20_000, 100_000, day)
    expect(await spentToday(store, "u1", day)).toBe(20_000)
    if (!held.ok) throw new Error("expected a reservation")
    await releaseDaily(store, held)
    expect(await spentToday(store, "u1", day)).toBe(0)
  })

  it("starts each UTC day from zero", async () => {
    const store = createMemoryStore()
    await reserveDaily(store, "u1", 10_000, 10_000, day)
    expect((await reserveDaily(store, "u1", 10_000, 10_000, new Date("2026-10-02T00:00:01Z"))).ok).toBe(true)
  })
})
