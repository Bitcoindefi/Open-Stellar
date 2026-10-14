import { afterEach, describe, expect, it, vi } from "vitest"
import {
  PAYMENT_NETWORK_EVENT,
  PAYMENT_NETWORK_STORAGE_KEY,
  paymentNetworkRequestFields,
  readPaymentNetwork,
  writePaymentNetwork,
} from "@/lib/rails/preference"

function fakeWindow(options: { broken?: boolean } = {}) {
  const items = new Map<string, string>()
  const events: string[] = []
  const localStorage = {
    getItem: (key: string) => {
      if (options.broken) throw new Error("blocked")
      return items.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (options.broken) throw new Error("blocked")
      items.set(key, value)
    },
  }
  vi.stubGlobal("window", { localStorage, dispatchEvent: (event: Event) => { events.push(event.type); return true } })
  return { items, events }
}

afterEach(() => vi.unstubAllGlobals())

describe("Red de pago preference", () => {
  it("is always Solana while the Arc flag is off, whatever is stored", () => {
    const { items } = fakeWindow()
    items.set(PAYMENT_NETWORK_STORAGE_KEY, "arc")
    expect(readPaymentNetwork(false)).toBe("solana")
  })

  it("reads the stored choice with the flag on, and ignores junk", () => {
    const { items } = fakeWindow()
    expect(readPaymentNetwork(true)).toBe("solana")
    items.set(PAYMENT_NETWORK_STORAGE_KEY, "arc")
    expect(readPaymentNetwork(true)).toBe("arc")
    items.set(PAYMENT_NETWORK_STORAGE_KEY, "base")
    expect(readPaymentNetwork(true)).toBe("solana")
  })

  it("stores the choice and announces it, even when storage is blocked", () => {
    const ok = fakeWindow()
    writePaymentNetwork("arc")
    expect(ok.items.get(PAYMENT_NETWORK_STORAGE_KEY)).toBe("arc")
    expect(ok.events).toEqual([PAYMENT_NETWORK_EVENT])

    const blocked = fakeWindow({ broken: true })
    writePaymentNetwork("arc")
    expect(blocked.events).toEqual([PAYMENT_NETWORK_EVENT])
    expect(readPaymentNetwork(true)).toBe("solana")
  })

  it("adds a network field only for Arc", () => {
    expect(paymentNetworkRequestFields("arc")).toEqual({ network: "arc" })
    expect(paymentNetworkRequestFields("solana")).toEqual({})
  })
})
