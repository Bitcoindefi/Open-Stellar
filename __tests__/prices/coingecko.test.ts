import { describe, expect, it } from "vitest"
import { formatUsd, mapCoinGeckoPrices, xlmToUsd } from "@/lib/prices/coingecko"

describe("CoinGecko price helpers", () => {
  it("maps CoinGecko simple-price payloads to the app price shape", () => {
    const prices = mapCoinGeckoPrices(
      {
        stellar: { usd: 0.184 },
        bitcoin: { usd: 98240 },
        "usd-coin": { usd: 0.9998 },
      },
      1234
    )

    expect(prices).toEqual({
      xlm: 0.184,
      btc: 98240,
      usdc: 0.9998,
      fetchedAt: 1234,
    })
  })

  it("falls back safely when a feed value is missing", () => {
    const prices = mapCoinGeckoPrices({})

    expect(prices.xlm).toBe(0)
    expect(prices.btc).toBe(0)
    expect(prices.usdc).toBe(1)
  })

  it("converts XLM amounts to USD", () => {
    const prices = mapCoinGeckoPrices({ stellar: { usd: 0.18 } })

    expect(xlmToUsd(2.4, prices)).toBeCloseTo(0.432)
  })

  it("formats small micro-payment values with useful precision", () => {
    expect(formatUsd(0.009)).toBe("$0.0090")
    expect(formatUsd(1.234)).toBe("$1.23")
  })
})

