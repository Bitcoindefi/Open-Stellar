"use client"

import dynamic from "next/dynamic"
import { Wallet } from "lucide-react"

// Wallet Standard discovery only exists in the browser.
const AgentWalletPanel = dynamic(() => import("@/components/x402/agent-wallet-panel").then((mod) => mod.AgentWalletPanel), { ssr: false })
const ArcAgentWalletPanel = dynamic(() => import("@/components/x402/arc-agent-wallet-panel").then((mod) => mod.ArcAgentWalletPanel), { ssr: false })

export type FundCardData = { address: string; balanceUsdc: string; neededUsdc: string }

/**
 * Shown in the transcript when a hire could not be paid because the agents' wallet is empty.
 * Funding it is one signature from the person's own wallet, right here; then they ask again.
 * An 0x address is the Arc testnet agents' wallet ("Red de pago: Arc").
 */
export function FundCard({ data }: { data: FundCardData }) {
  const arc = /^0x[0-9a-fA-F]{40}$/.test(data.address)
  return (
    <section aria-label="Cargar la wallet de tus agentes" style={{ border: "1px solid #22d3ee55", borderRadius: 8, background: "#08334455", padding: "9px 10px", display: "grid", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace", fontSize: 10, fontWeight: 800, color: "#67e8f9", textTransform: "uppercase", letterSpacing: 0.8 }}>
        <Wallet size={12} aria-hidden="true" /> La wallet de tus agentes necesita fondos
      </div>
      <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, lineHeight: 1.5, color: "#e2e8f0" }}>
        Una contratación cuesta {data.neededUsdc} USDC y la wallet de tus agentes tiene {data.balanceUsdc} USDC. No se cobró nada. Cargala desde tu propia wallet y volvé a enviar tu mensaje.
      </p>
      {arc ? <ArcAgentWalletPanel compact /> : <AgentWalletPanel compact />}
    </section>
  )
}
