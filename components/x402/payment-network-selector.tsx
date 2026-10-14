"use client"

import { Network } from "lucide-react"
import { RAIL_IDS, railFor } from "@/lib/rails"
import { usePaymentNetwork } from "@/lib/rails/preference"

// "Red de pago: Solana | Arc". Each browser chooses; the agents' wallet, the hires paid in the
// chat and their receipts follow the choice. Only rendered while NEXT_PUBLIC_ENABLE_ARC is on.

export function PaymentNetworkSelector() {
  const { id, setNetwork } = usePaymentNetwork()
  return (
    <section aria-label="Red de pago" className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[.24em] text-slate-400">
          <Network className="h-3.5 w-3.5" aria-hidden="true" /> Red de pago
        </span>
        <div role="radiogroup" aria-label="Red de pago" className="ml-auto inline-flex rounded-lg border border-slate-700 p-0.5">
          {RAIL_IDS.map((rail) => {
            const selected = rail === id
            return (
              <button
                key={rail}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setNetwork(rail)}
                className={`min-h-9 rounded-md px-3 font-mono text-[11px] uppercase tracking-wider transition ${selected ? "bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:text-slate-200"}`}
              >
                {railFor(rail).shortName}
              </button>
            )
          })}
        </div>
      </div>
      <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
        {id === "arc"
          ? "Arc testnet (Circle): las contrataciones se pagan en USDC y el gas también es USDC. Wallet, recibos e identidad van aparte de Solana."
          : "Solana devnet: las contrataciones se pagan en USDC desde la wallet de tus agentes en Solana."}
      </p>
    </section>
  )
}
