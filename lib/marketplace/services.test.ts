import { afterEach, describe, expect, it, vi } from "vitest"

async function loadServices(flag: string | undefined) {
  vi.resetModules()
  vi.stubEnv("NEXT_PUBLIC_ENABLE_STELLAR", flag ?? "")
  return import("./services")
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("marketplace price oracle copy", () => {
  it("reads as a Solana service when Stellar is off", async () => {
    const { getMarketplaceService } = await loadServices(undefined)
    const oracle = getMarketplaceService("stellar-price-oracle")

    expect(oracle?.name).toBe("Solana Price Oracle")
    expect(oracle?.description).toContain("SOL")
    expect(oracle?.docs[0]).toContain("Solana assets")
    expect(oracle?.exampleRequest.pair).toBe("SOL/USDC")
    expect(oracle?.exampleResponse.pair).toBe("SOL/USDC")
  })

  it("keeps the Stellar copy when the flag is on", async () => {
    const { getMarketplaceService } = await loadServices("true")
    const oracle = getMarketplaceService("stellar-price-oracle")

    expect(oracle?.name).toBe("Stellar Price Oracle")
    expect(oracle?.description).toContain("XLM")
    expect(oracle?.docs[0]).toContain("Stellar assets")
    expect(oracle?.exampleRequest.pair).toBe("XLM/USDC")
    expect(oracle?.exampleResponse.pair).toBe("XLM/USDC")
  })

  it("keeps the service id stable for existing links", async () => {
    const { listMarketplaceServices } = await loadServices(undefined)
    expect(listMarketplaceServices().map((service) => service.id)).toContain("stellar-price-oracle")
  })
})
