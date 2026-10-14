import { describe, expect, it } from "vitest"
import { ARC_RAIL, RAILS, SOLANA_RAIL, isArcEnabled, networkLabel, railForNetwork, requestedRail, requestedRailFromUrl } from "@/lib/rails"
import { ARC_TESTNET_CHAIN_ID, arcTestnetChain } from "@/lib/rails/arc/constants"

const TX = `0x${"9c".repeat(32)}`
const SIG = "5".repeat(88)

describe("payment rails", () => {
  it("keeps Solana devnet exactly as before", () => {
    expect(SOLANA_RAIL).toMatchObject({ id: "solana", caip2: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", receiptNetwork: "solana:devnet", label: "Solana devnet", decimals: 6 })
    expect(SOLANA_RAIL.explorerTx(SIG)).toBe(`https://explorer.solana.com/tx/${SIG}?cluster=devnet`)
    expect(SOLANA_RAIL.isTxId(SIG)).toBe(true)
    expect(SOLANA_RAIL.isTxId(TX)).toBe(false)
  })

  it("describes Arc testnet with Circle's USDC (6 decimals) and the Arc explorer", () => {
    expect(ARC_RAIL).toMatchObject({ id: "arc", caip2: "eip155:5042002", receiptNetwork: "arc-testnet", label: "Arc testnet", asset: "0x3600000000000000000000000000000000000000", decimals: 6 })
    expect(ARC_RAIL.explorerTx(TX)).toBe(`https://explorer.testnet.arc.io/tx/${TX}`)
    expect(ARC_RAIL.explorerAddress("0x61A3be1Cd5908017af06D5517E42817Fa3bE149d")).toBe("https://explorer.testnet.arc.io/address/0x61A3be1Cd5908017af06D5517E42817Fa3bE149d")
    expect(ARC_RAIL.isTxId(TX)).toBe(true)
    expect(ARC_RAIL.isTxId(SIG)).toBe(false)
    expect(ARC_RAIL.isAddress("0x61A3be1Cd5908017af06D5517E42817Fa3bE149d")).toBe(true)
    expect(Object.keys(RAILS)).toEqual(["solana", "arc"])
  })

  it("defines the Arc chain from the documented endpoints", () => {
    const chain = arcTestnetChain()
    expect(chain.id).toBe(ARC_TESTNET_CHAIN_ID)
    expect(chain.rpcUrls.default.http[0]).toBe("https://rpc.testnet.arc.io")
    expect(chain.blockExplorers?.default.url).toBe("https://explorer.testnet.arc.io")
    expect(chain.nativeCurrency).toEqual({ name: "USDC", symbol: "USDC", decimals: 18 })
  })

  it("maps receipt and settle networks to their rail; anything unknown is Solana", () => {
    expect(railForNetwork("arc-testnet")).toBe(ARC_RAIL)
    expect(railForNetwork("eip155:5042002")).toBe(ARC_RAIL)
    expect(railForNetwork("solana:devnet")).toBe(SOLANA_RAIL)
    expect(railForNetwork(undefined)).toBe(SOLANA_RAIL)
    expect(networkLabel("eip155:5042002")).toBe("Arc testnet")
    expect(networkLabel(null)).toBe("Solana devnet")
  })

  it("only accepts Arc when NEXT_PUBLIC_ENABLE_ARC is on", () => {
    const off = {}
    const on = { NEXT_PUBLIC_ENABLE_ARC: "true" }
    expect(isArcEnabled(off)).toBe(false)
    expect(isArcEnabled(on)).toBe(true)
    expect(requestedRail(undefined, off)).toEqual({ ok: true, rail: "solana" })
    expect(requestedRail("solana", off)).toEqual({ ok: true, rail: "solana" })
    expect(requestedRail("arc", off)).toEqual({ ok: false, error: "Arc payments are not enabled on this server." })
    expect(requestedRail("arc", on)).toEqual({ ok: true, rail: "arc" })
    expect(requestedRail("ethereum", on).ok).toBe(false)
    expect(requestedRailFromUrl("https://x.test/api/agent-wallet?network=arc", on)).toEqual({ ok: true, rail: "arc" })
    expect(requestedRailFromUrl("https://x.test/api/agent-wallet", on)).toEqual({ ok: true, rail: "solana" })
  })
})
