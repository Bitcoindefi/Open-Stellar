import { describe, expect, it } from "vitest"
import {
  ARC_RECEIPTS_KEY,
  RECEIPTS_KEY,
  createMemoryReceiptBackend,
  parseStoredReceipt,
  readReceiptLog,
  recordReceipt,
  sanitizeReceipt,
  shortEvmAddress,
} from "@/lib/receipts/log"
import { parseFilters, queryReceipts } from "@/lib/receipts/query"

const TX = "0x9c5da2f5a1338bcd3fd5673beb22e1ef8f62690185cfb3196712a66128d5df3b"
const PAYER = "0x459E57c355b455Ef5544200B521e9b8994D8a451"
const SIG = "5".repeat(88)

describe("Arc testnet receipts", () => {
  it("keeps an 0x hash when the receipt is on arc-testnet (it is not dropped)", () => {
    const record = sanitizeReceipt({ type: "payment", tx: TX, amount: "10000", asset: "0x3600000000000000000000000000000000000000", agentId: "nexus", payer: PAYER, network: "arc-testnet" }, 1_000)
    expect(record).toMatchObject({ id: `payment:${TX}`, tx: TX, network: "arc-testnet", amount: "10000", asset: "USDC", payer: "0x459E…a451" })
  })

  it("still drops an 0x hash on a Solana receipt and a base58 signature on an Arc one", () => {
    expect(sanitizeReceipt({ type: "payment", tx: TX })).toBeNull()
    expect(sanitizeReceipt({ type: "payment", tx: SIG, network: "arc-testnet" })).toBeNull()
    expect(sanitizeReceipt({ type: "payment", tx: SIG })?.network).toBe("solana:devnet")
  })

  it("shortens EVM addresses and keeps stored Arc records intact", () => {
    expect(shortEvmAddress(PAYER)).toBe("0x459E…a451")
    expect(shortEvmAddress("0x459E…a451")).toBe("0x459E…a451")
    expect(shortEvmAddress("not an address")).toBeNull()
    const stored = JSON.stringify(sanitizeReceipt({ type: "hire", tx: TX, amount: 10000, payer: PAYER, network: "arc-testnet" }, 5))
    expect(parseStoredReceipt(stored)).toMatchObject({ tx: TX, network: "arc-testnet", payer: "0x459E…a451", timestamp: 5 })
  })

  it("writes Arc receipts to their own list (ac:arc:receipts:v1)", async () => {
    const backend = createMemoryReceiptBackend()
    expect(await recordReceipt({ type: "payment", tx: TX, amount: "10000", network: "arc-testnet" }, { backend })).toBe(true)
    expect(await recordReceipt({ type: "payment", tx: SIG, amount: "10000" }, { backend })).toBe(true)
    expect((await readReceiptLog(backend, ARC_RECEIPTS_KEY)).map((record) => record.tx)).toEqual([TX])
    expect((await readReceiptLog(backend, RECEIPTS_KEY)).map((record) => record.tx)).toEqual([SIG])
  })

  it("filters /api/receipts by network only when networks are enabled", () => {
    const arc = sanitizeReceipt({ type: "payment", tx: TX, amount: "10000", agentId: "a", network: "arc-testnet" }, 2)!
    const solana = sanitizeReceipt({ type: "payment", tx: SIG, amount: "20000", agentId: "b" }, 1)!
    const params = new URLSearchParams("network=arc")
    expect(parseFilters(params)).toEqual({ type: "all", agent: null, page: 1, pageSize: 25 })
    const filters = parseFilters(params, { networks: true })
    expect(filters.network).toBe("arc-testnet")
    const page = queryReceipts([arc, solana], filters)
    expect(page.receipts.map((record) => record.tx)).toEqual([TX])
    expect(page.totals.volumeUsdc).toBe(0.01)
    expect(page.agents).toEqual([{ id: "a", name: "a" }])
    expect(queryReceipts([arc, solana], parseFilters(new URLSearchParams("network=solana"), { networks: true })).receipts.map((record) => record.tx)).toEqual([SIG])
    expect(queryReceipts([arc, solana], parseFilters(new URLSearchParams(), { networks: true })).total).toBe(2)
  })
})
