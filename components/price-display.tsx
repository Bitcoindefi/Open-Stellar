"use client";

import { formatUsd, xlmToUsd } from "@/lib/prices/coingecko";
import { usePrices } from "@/hooks/use-prices";

export function PriceTicker() {
  const { prices, isLoading, error } = usePrices();

  const status = error ? "offline" : isLoading ? "loading" : "live";
  const xlm = prices ? formatUsd(prices.xlm) : "--";
  const btc = prices ? formatUsd(prices.btc) : "--";

  return (
    <div
      aria-label={`CoinGecko price feed ${status}`}
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 6,
        display: "flex",
        alignItems: "center",
        gap: 10,
        border: "1px solid #2a3a52",
        borderRadius: 8,
        background: "rgba(15, 23, 42, 0.86)",
        color: "#e2e8f0",
        fontFamily: "monospace",
        fontSize: 11,
        padding: "8px 10px",
        boxShadow: "0 12px 36px rgba(0,0,0,0.35)",
        backdropFilter: "blur(8px)",
      }}
    >
      <span
        style={{
          color:
            status === "live"
              ? "#34d399"
              : status === "offline"
                ? "#f87171"
                : "#fbbf24",
        }}
      >
        {status.toUpperCase()}
      </span>
      <span>XLM {xlm}</span>
      <span style={{ color: "#64748b" }}>|</span>
      <span>BTC {btc}</span>
    </div>
  );
}

export function XlmUsdValue({ amount }: { amount: number }) {
  const { prices } = usePrices();

  if (!prices) return null;

  return (
    <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>
      {" â‰ˆ " + formatUsd(xlmToUsd(amount, prices))}
    </span>
  );
}
