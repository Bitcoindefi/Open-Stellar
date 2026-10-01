import { describe, expect, it } from "vitest"
import { formatAssetAmount, paymentAssetFor, parseFeatureFlag, publicNetworkLabel } from "./chains"

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
