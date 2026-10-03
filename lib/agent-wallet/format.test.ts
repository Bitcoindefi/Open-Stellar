import { describe, expect, it } from "vitest"
import { mayHoldUsdc, usdcLabel } from "@/lib/agent-wallet/format"

describe("usdcLabel", () => {
  it("uses a decimal comma and at least two decimals", () => {
    expect(usdcLabel("0.1")).toBe("0,10")
    expect(usdcLabel("0.08")).toBe("0,08")
    expect(usdcLabel("0.085")).toBe("0,085")
    expect(usdcLabel("2")).toBe("2,00")
    expect(usdcLabel("0")).toBe("0,00")
  })
})

describe("mayHoldUsdc", () => {
  it("offers a withdrawal only when there may be something to withdraw", () => {
    expect(mayHoldUsdc("0")).toBe(false)
    expect(mayHoldUsdc("0.01")).toBe(true)
    expect(mayHoldUsdc(null)).toBe(true)
  })
})
