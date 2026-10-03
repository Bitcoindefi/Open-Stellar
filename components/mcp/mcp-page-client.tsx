"use client"

import dynamic from "next/dynamic"
import { McpClientsPanel } from "@/components/mcp/mcp-clients-panel"

const AgentWalletPanel = dynamic(() => import("@/components/x402/agent-wallet-panel").then((mod) => mod.AgentWalletPanel), { ssr: false })

export function McpPageClient() {
  return (
    <>
      <McpClientsPanel />
      <AgentWalletPanel compact />
    </>
  )
}
