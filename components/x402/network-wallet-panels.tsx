"use client"

import dynamic from "next/dynamic"
import { usePaymentNetwork } from "@/lib/rails/preference"
import { AgentWalletPanel } from "./agent-wallet-panel"
import { PaidTaskPanel } from "./paid-task-panel"
import { PaymentNetworkSelector } from "./payment-network-selector"

// The Wallet tab while Arc is enabled: the "Red de pago" selector, then the panels of the chosen
// network. Solana keeps its agents' wallet and the browser pay-per-task panel; Arc shows its own
// agents' wallet, loaded only when chosen. This component itself is loaded client-side only
// (see components/sidebar-panel.tsx), so the Solana panels can be imported directly.

const ArcAgentWalletPanel = dynamic(() => import("./arc-agent-wallet-panel").then((mod) => mod.ArcAgentWalletPanel), { ssr: false })

export function NetworkWalletPanels() {
  const { id } = usePaymentNetwork()
  return (
    <>
      <PaymentNetworkSelector />
      {id === "arc" ? <ArcAgentWalletPanel /> : <><AgentWalletPanel /><PaidTaskPanel /></>}
    </>
  )
}
