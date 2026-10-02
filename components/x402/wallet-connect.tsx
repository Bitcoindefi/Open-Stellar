"use client"

import { useState } from "react"
import { useConnect, useDisconnect } from "@wallet-standard/react"
import type { UiWallet, UiWalletAccount } from "@wallet-standard/react"

// Connecting a Solana wallet (Phantom, Solflare...) through Wallet Standard, shared by the
// paid-task panel and the agents' wallet panel.

export const WALLET_CHAIN = "solana:devnet"

export function supportsDevnetSigning(wallet: UiWallet) {
  return wallet.chains.includes(WALLET_CHAIN) && wallet.features.includes("solana:signTransaction")
}

export function ConnectButton({ wallet, onConnected, className }: { wallet: UiWallet; onConnected: (account: UiWalletAccount) => void; className: string }) {
  const [connecting, connect] = useConnect(wallet)
  const [error, setError] = useState("")
  return (
    <div>
      <button type="button" disabled={connecting} onClick={() => {
        setError("")
        connect().then((accounts) => {
          const first = accounts.find((item) => item.chains.includes(WALLET_CHAIN)) ?? accounts[0]
          if (first) onConnected(first)
          else setError("La wallet no compartió ninguna cuenta.")
        }).catch(() => setError("No se pudo conectar la wallet."))
      }} className={className}>
        {wallet.icon ? <img src={wallet.icon} alt="" className="h-4 w-4" /> : null} {connecting ? "Conectando…" : `Conectar ${wallet.name}`}
      </button>
      {error ? <p role="alert" className="mt-2 text-xs text-rose-200">{error}</p> : null}
    </div>
  )
}

export function DisconnectButton({ wallet, onDisconnect }: { wallet: UiWallet; onDisconnect: () => void }) {
  const [busy, disconnect] = useDisconnect(wallet)
  return <button type="button" disabled={busy} onClick={() => { disconnect().finally(onDisconnect) }} className="text-[11px] text-slate-400 underline">Desconectar</button>
}
