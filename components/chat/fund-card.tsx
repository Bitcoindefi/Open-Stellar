"use client"

import dynamic from "next/dynamic"
import { Wallet } from "lucide-react"

// Wallet Standard discovery only exists in the browser.
const AgentWalletPanel = dynamic(() => import("@/components/x402/agent-wallet-panel").then((mod) => mod.AgentWalletPanel), { ssr: false })

export type FundCardData = { address: string; balanceUsdc: string; neededUsdc: string }

/**
 * Shown in the transcript when a hire could not be paid because the agents' wallet is empty.
 * Funding it is one signature from the person's own wallet, right here; then they ask again.
 */
export function FundCard({ data }: { data: FundCardData }) {
  return (
    <section aria-label="Fund your agents' wallet" style={{ border: "1px solid #22d3ee55", borderRadius: 8, background: "#08334455", padding: "9px 10px", display: "grid", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace", fontSize: 10, fontWeight: 800, color: "#67e8f9", textTransform: "uppercase", letterSpacing: 0.8 }}>
        <Wallet size={12} aria-hidden="true" /> Your agents&apos; wallet needs funds
      </div>
      <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, lineHeight: 1.5, color: "#e2e8f0" }}>
        A hire costs {data.neededUsdc} USDC and your agents&apos; wallet holds {data.balanceUsdc} USDC. Nothing was charged. Fund it from your own wallet, then send your message again.
      </p>
      <AgentWalletPanel compact />
    </section>
  )
}
