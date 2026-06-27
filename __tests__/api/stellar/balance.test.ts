import { describe, it, expect, vi } from "vitest"

// Use function keyword (not arrow) so `new Server()` works correctly as a constructor mock
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const original = await importOriginal<typeof import("@stellar/stellar-sdk")>()
  return {
    ...original,
    Horizon: {
      Server: vi.fn().mockImplementation(function (this: { loadAccount: unknown }) {
        this.loadAccount = vi.fn().mockImplementation(async function (publicKey: string) {
          if (publicKey === "FUNDED_ACCOUNT") {
            return { balances: [{ asset_type: "native", balance: "10000.0000000" }] }
          }
          if (publicKey === "UNFUNDED_ACCOUNT") {
            throw new Error("404 Not Found")
          }
          throw new Error("Network error: connect ECONNREFUSED")
        })
      }),
    },
  }
})

import { POST } from "@/app/api/stellar/balance/route"

describe("POST /api/stellar/balance", () => {
  it("rejects missing publicKey with 400", async () => {
    const req = new Request("http://localhost/api/stellar/balance", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns balance and funded:true for a funded account", async () => {
    const req = new Request("http://localhost/api/stellar/balance", {
      method: "POST",
      body: JSON.stringify({ publicKey: "FUNDED_ACCOUNT" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.balance).toBe("10000.0000000")
    expect(data.funded).toBe(true)
  })

  it("returns balance:0 and funded:false with error:null for unfunded account (404)", async () => {
    const req = new Request("http://localhost/api/stellar/balance", {
      method: "POST",
      body: JSON.stringify({ publicKey: "UNFUNDED_ACCOUNT" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.balance).toBe("0")
    expect(data.funded).toBe(false)
    expect(data.error).toBeNull()
  })

  it("returns error:network when Stellar is unreachable", async () => {
    const req = new Request("http://localhost/api/stellar/balance", {
      method: "POST",
      body: JSON.stringify({ publicKey: "SOME_OTHER_ACCOUNT" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.balance).toBe("0")
    expect(data.funded).toBe(false)
    expect(data.error).toBe("network")
  })
})
