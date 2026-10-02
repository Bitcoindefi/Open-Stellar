import { afterEach, describe, expect, it, vi } from "vitest"
import { formatAssetAmount, paymentAssetFor, parseFeatureFlag, publicNetworkLabel } from "./chains"

describe("NEXT_PUBLIC_ENABLE_STELLAR", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function load(flag: string) {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_ENABLE_STELLAR", flag)
    return import("./chains")
  }

  it("keeps the public UI on Solana and USDC by default", async () => {
    const chains = await load("")
    expect(chains.STELLAR_ENABLED).toBe(false)
    expect(chains.PAYMENT_ASSET).toBe("USDC")
    expect(chains.formatAssetAmount("0.01")).toBe("0.01 USDC")
    expect(chains.publicNetworkLabel()).toBe("Solana devnet")
  })

  it("brings back XLM and Stellar labels when the flag is on", async () => {
    const chains = await load("true")
    expect(chains.STELLAR_ENABLED).toBe(true)
    expect(chains.PAYMENT_ASSET).toBe("XLM")
    expect(chains.formatAssetAmount("0.01")).toBe("0.01 XLM")
    expect(chains.publicNetworkLabel()).toBe("Stellar testnet")
  })
})

describe("parseFeatureFlag", () => {
  it("is off by default", () => {
    expect(parseFeatureFlag(undefined)).toBe(false)
    expect(parseFeatureFlag(null)).toBe(false)
    expect(parseFeatureFlag("")).toBe(false)
  })

  it("accepts common truthy spellings", () => {
    for (const value of ["true", "TRUE", " 1 ", "yes", "on"]) {
      expect(parseFeatureFlag(value)).toBe(true)
    }
  })

  it("treats anything else as off", () => {
    for (const value of ["false", "0", "no", "off", "stellar"]) {
      expect(parseFeatureFlag(value)).toBe(false)
    }
  })
})

describe("payment asset", () => {
  it("is USDC on the Solana-first surface and XLM when Stellar is on", () => {
    expect(paymentAssetFor(false)).toBe("USDC")
    expect(paymentAssetFor(true)).toBe("XLM")
  })

  it("formats amounts with the chosen asset", () => {
    expect(formatAssetAmount(0.08, { digits: 2, asset: "USDC" })).toBe("0.08 USDC")
    expect(formatAssetAmount("10", { asset: "XLM" })).toBe("10 XLM")
    expect(formatAssetAmount("abc", { digits: 2, asset: "USDC" })).toBe("abc USDC")
  })

  it("labels the public network", () => {
    expect(publicNetworkLabel(false)).toBe("Solana devnet")
    expect(publicNetworkLabel(true)).toBe("Stellar testnet")
  })
})
