"use client"

import { useSyncExternalStore } from "react"
import { ARC_ENABLED, DEFAULT_RAIL, isRailId, railFor, type RailId, type RailInfo } from "@/lib/rails"

// "Red de pago": the payment network this browser chose in the Wallet tab. Stored per browser in
// localStorage; with NEXT_PUBLIC_ENABLE_ARC off it is always Solana, whatever is stored.

export const PAYMENT_NETWORK_STORAGE_KEY = "agentic-city:payment-network:v1"
export const PAYMENT_NETWORK_EVENT = "agentic-city:payment-network-changed"

export function readPaymentNetwork(enabled: boolean = ARC_ENABLED): RailId {
  if (!enabled) return DEFAULT_RAIL
  try {
    const stored = window.localStorage.getItem(PAYMENT_NETWORK_STORAGE_KEY)
    return isRailId(stored) ? stored : DEFAULT_RAIL
  } catch {
    return DEFAULT_RAIL
  }
}

export function writePaymentNetwork(id: RailId): void {
  try {
    window.localStorage.setItem(PAYMENT_NETWORK_STORAGE_KEY, id)
  } catch {
    // Blocked storage: the choice still applies until the page reloads.
  }
  window.dispatchEvent(new Event(PAYMENT_NETWORK_EVENT))
}

/** Extra chat request fields for the chosen network: nothing for Solana, so its requests are unchanged. */
export function paymentNetworkRequestFields(id: RailId = readPaymentNetwork()): { network?: "arc" } {
  return id === "arc" ? { network: "arc" } : {}
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(PAYMENT_NETWORK_EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(PAYMENT_NETWORK_EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

export function usePaymentNetwork(): { id: RailId; rail: RailInfo; setNetwork: (id: RailId) => void } {
  const id = useSyncExternalStore(subscribe, () => readPaymentNetwork(), () => DEFAULT_RAIL)
  return { id, rail: railFor(id), setNetwork: writePaymentNetwork }
}
