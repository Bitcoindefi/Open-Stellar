"use client"

import dynamic from "next/dynamic"
import { usePaymentNetwork } from "@/lib/rails/preference"
import { PaymentNetworkSelector } from "./payment-network-selector"

// The Wallet tab while Arc is enabled: the "Red de pago" selector, then the panels of the chosen
// network. Solana keeps its agents' wallet and the browser pay-per-task panel; Arc shows its own
// agents' wallet. Each network's panels load only when chosen.

const AgentWalletPanel = dynamic(() => import("./agent-wallet-panel").then((mod) => mod.AgentWalletPanel), { ssr: false })
const PaidTaskPanel = dynamic(() => import("./paid-task-panel").then((mod) => mod.PaidTaskPanel), { ssr: false })
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
