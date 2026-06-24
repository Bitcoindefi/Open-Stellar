export interface Prices {
  xlm: number
  btc: number
  usdc: number
  fetchedAt: number
}

type CoinGeckoSimplePrice = {
  stellar?: { usd?: number }
  bitcoin?: { usd?: number }
  "usd-coin"?: { usd?: number }
}

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=stellar,bitcoin,usd-coin&vs_currencies=usd"

const DEFAULT_PRICES: Prices = {
  xlm: 0,
  btc: 0,
  usdc: 1,
  fetchedAt: 0,
}

let cachedPrices: Prices | null = null
let cacheExpiresAt = 0

function readUsd(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function mapCoinGeckoPrices(payload: CoinGeckoSimplePrice, fetchedAt = Date.now()): Prices {
  return {
    xlm: readUsd(payload.stellar?.usd),
    btc: readUsd(payload.bitcoin?.usd),
    usdc: readUsd(payload["usd-coin"]?.usd, 1),
    fetchedAt,
  }
}

export async function getPrices(fetcher: typeof fetch = fetch): Promise<Prices> {
  const now = Date.now()

  if (cachedPrices && cacheExpiresAt > now) {
    return cachedPrices
  }

  const response = await fetcher(COINGECKO_URL, {
    headers: { accept: "application/json" },
    next: { revalidate: 60 },
  })

  if (!response.ok) {
    if (cachedPrices) return cachedPrices
    return { ...DEFAULT_PRICES, fetchedAt: now }
  }

  const payload = (await response.json()) as CoinGeckoSimplePrice
  cachedPrices = mapCoinGeckoPrices(payload, now)
  cacheExpiresAt = now + 60_000
  return cachedPrices
}

export function xlmToUsd(xlm: number, prices: Prices): number {
  const amount = Number(xlm)
  if (!Number.isFinite(amount)) return 0
  return amount * prices.xlm
}

export function formatUsd(n: number): string {
  const value = Number(n)
  if (!Number.isFinite(value)) return "$0.00"

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  }).format(value)
}

