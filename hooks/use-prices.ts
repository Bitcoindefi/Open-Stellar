"use client"

import { useEffect, useState } from "react"
import type { Prices } from "@/lib/prices/coingecko"

type PriceState = {
  prices: Prices | null
  isLoading: boolean
  error: string | null
}

export function usePrices(refreshMs = 60_000): PriceState {
  const [state, setState] = useState<PriceState>({
    prices: null,
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function loadPrices() {
      try {
        const response = await fetch("/api/prices", { cache: "no-store" })
        const data = await response.json()

        if (cancelled) return

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Price feed unavailable")
        }

        setState({ prices: data.prices, isLoading: false, error: null })
      } catch (error) {
        if (cancelled) return
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Price feed unavailable",
        }))
      }
    }

    loadPrices()
    const interval = window.setInterval(loadPrices, refreshMs)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [refreshMs])

  return state
}

