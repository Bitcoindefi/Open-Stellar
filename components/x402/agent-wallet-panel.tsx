"use client"

import { useCallback, useEffect, useState } from "react"
import { useWallets } from "@wallet-standard/react"
import type { UiWallet, UiWalletAccount } from "@wallet-standard/react"
import { useSignAndSendTransaction, useSignTransaction } from "@solana/react"
import { createSolanaRpc, getBase58Decoder, getBase64Decoder, getBase64Encoder, type Base64EncodedWireTransaction } from "@solana/kit"
import { Activity, Bot, CircleAlert, Copy, ExternalLink, RefreshCw } from "lucide-react"
import { FUND_AMOUNT_MICRO, buildFundTransaction, fundTransactionProblem } from "@/lib/agent-wallet/fund-tx"
import { mayHoldUsdc, usdcLabel } from "@/lib/agent-wallet/format"
import { friendlyProviderError } from "@/lib/ai/friendly-error"
import { ConnectButton, DisconnectButton, WALLET_CHAIN, supportsDevnetSigning } from "./wallet-connect"

// "La wallet de tus agentes": a Solana devnet wallet that belongs to this browser (its key lives
// only in an encrypted httpOnly cookie) and pays the x402 hires the agents make in the chat.
// The person funds it with one signature from Phantom or Solflare and can withdraw everything.

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com"

export type AgentWalletStatus = {
  ok: boolean
  error?: string
  address: string
  balanceUsdc: string | null
  fundUsdc: string
  hirePriceUsdc: string
  caps: { perRunUsdc: string; perDayUsdc: string }
  spentTodayUsdc: string
  feePayer: string | null
  withdrawAvailable: boolean
  explorerUrl: string
}

function short(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

export function AgentWalletPanel({ compact = false }: { compact?: boolean }) {
  const wallets = useWallets().filter(supportsDevnetSigning)
  const [status, setStatus] = useState<AgentWalletStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [account, setAccount] = useState<UiWalletAccount | null>(null)
  const [walletName, setWalletName] = useState("")
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/agent-wallet", { cache: "no-store" })
      const data = await response.json().catch(() => ({})) as AgentWalletStatus
      if (!response.ok || !data.ok) throw new Error(data.error || "No pudimos abrir la wallet de tus agentes.")
      setStatus(data)
      setError("")
    } catch (loadError) {
      setError(loadError instanceof Error ? friendlyProviderError(loadError.message) : "No pudimos abrir la wallet de tus agentes.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const copy = async () => {
    if (!status) return
    try {
      await navigator.clipboard.writeText(status.address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const connected = account ? wallets.find((item) => item.name === walletName) : undefined

  return (
    <section className={`rounded-lg border border-cyan-300/20 bg-cyan-300/[.035] ${compact ? "p-2.5" : "p-3"}`}>
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-2.5 text-cyan-200"><Bot className="h-4 w-4" /></div>
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[.28em] text-slate-500">Sin login · Solana devnet</p>
          <h3 className="mt-1 font-pixel text-sm uppercase text-slate-100">La wallet de tus agentes</h3>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} aria-label="Actualizar saldo" className="ml-auto rounded-lg border border-slate-700 p-2 text-slate-400 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></button>
      </div>

      {status ? <>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-800 bg-[#050a12] px-3 py-2">
          <a href={status.explorerUrl} target="_blank" rel="noreferrer" className="min-w-0 truncate font-mono text-[11px] text-cyan-100 underline">{short(status.address)}</a>
          <button type="button" onClick={() => void copy()} aria-label="Copiar dirección" className="text-slate-400"><Copy className="h-3.5 w-3.5" /></button>
          {copied ? <span className="text-[10px] text-emerald-200">Copiada</span> : null}
          <span className="ml-auto font-mono text-sm text-slate-100">{status.balanceUsdc === null ? "…" : `${usdcLabel(status.balanceUsdc)} USDC`}</span>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">
          Paga {usdcLabel(status.hirePriceUsdc)} USDC cada vez que un agente contrata a otro en el chat. Tope sin preguntarte: {usdcLabel(status.caps.perRunUsdc)} por conversación y {usdcLabel(status.caps.perDayUsdc)} por día (hoy: {usdcLabel(status.spentTodayUsdc)}). Ni esta wallet ni la tuya necesitan SOL{status.feePayer ? "" : " (en este servidor la carga la paga tu wallet)"}.
        </p>
        {account ? (
          <WalletActions account={account} wallet={connected} walletName={walletName} status={status} onDone={load} onDisconnect={() => setAccount(null)} />
        ) : wallets.length === 0 ? (
          <p className="mt-3 text-xs leading-5 text-amber-100">Para cargarla necesitás <a className="underline" href="https://phantom.com/download" target="_blank" rel="noreferrer">Phantom</a> o Solflare con USDC de devnet.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {wallets.map((wallet) => <ConnectButton key={wallet.name} wallet={wallet} className={buttonClass} onConnected={(next) => { setAccount(next); setWalletName(wallet.name) }} />)}
          </div>
        )}
        <p className="mt-3 text-[10px] leading-4 text-slate-500">La clave vive solo en una cookie cifrada de este navegador; no la guardamos en ningún otro lado. Si borrás las cookies perdés lo que quede adentro (es devnet): antes, usá “Retirar todo”.</p>
      </> : loading ? <p className="mt-3 text-xs text-slate-400">Abriendo la wallet…</p> : null}

      {error ? <p role="alert" className="mt-2 flex items-start gap-2 text-xs leading-5 text-rose-200"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p> : null}
    </section>
  )
}

function WalletActions({ account, wallet, walletName, status, onDone, onDisconnect }: {
  account: UiWalletAccount
  wallet?: UiWallet
  walletName: string
  status: AgentWalletStatus
  onDone: () => Promise<void>
  onDisconnect: () => void
}) {
  const signAndSend = useSignAndSendTransaction(account, WALLET_CHAIN)
  const signTransaction = useSignTransaction(account, WALLET_CHAIN)
  const [busy, setBusy] = useState<"fund" | "withdraw" | null>(null)
  const [error, setError] = useState("")
  const [last, setLast] = useState<{ label: string; url: string } | null>(null)

  const refreshSoon = async () => {
    // The RPC sees a new balance a moment after the wallet reports the signature.
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => window.setTimeout(resolve, 2500))
      await onDone()
    }
  }

  const fund = async () => {
    setBusy("fund")
    setError("")
    try {
      const rpc = createSolanaRpc(RPC_URL)
      let text: string
      // Sponsored: the server pays the fee and rent and signs first; this wallet only signs the transfer.
      const response = await fetch("/api/agent-wallet/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payer: account.address }),
      })
      const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; transaction?: string }
      if (response.ok && data.ok && data.transaction && status.feePayer) {
        const bytes = new Uint8Array(getBase64Encoder().encode(data.transaction))
        const problem = await fundTransactionProblem(bytes, { payer: account.address, agentWallet: status.address, feePayer: status.feePayer, maxAmountMicro: FUND_AMOUNT_MICRO })
        if (problem) throw new Error(`La transacción de carga no es la esperada (${problem}). No la firmes.`)
        const { signedTransaction } = await signTransaction({ transaction: bytes })
        const wire = getBase64Decoder().decode(signedTransaction) as Base64EncodedWireTransaction
        text = await rpc.sendTransaction(wire, { encoding: "base64", preflightCommitment: "confirmed" }).send()
      } else if (response.status === 503) {
        // No sponsor on this server: this wallet pays the fee (and the one-time rent) itself.
        const { value } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send()
        const transaction = await buildFundTransaction({ payer: account.address, agentWallet: status.address, latestBlockhash: value })
        const { signature } = await signAndSend({ transaction })
        text = getBase58Decoder().decode(signature)
      } else {
        throw new Error(data.error || "No se pudo preparar la carga.")
      }
      setLast({ label: `Cargaste ${usdcLabel(status.fundUsdc)} USDC`, url: `https://explorer.solana.com/tx/${text}?cluster=devnet` })
      // Signed and sent: free the buttons while the balance catches up (it kept saying "Firmando…").
      setBusy(null)
      await refreshSoon()
    } catch (fundError) {
      const message = fundError instanceof Error ? fundError.message : ""
      setError(/insufficient|0x1\b|funds|AccountNotFound|InvalidAccountData/i.test(message)
        ? "Tu wallet no tiene USDC de devnet suficiente. Cargá en faucet.circle.com → Solana Devnet."
        : /reject|cancel|denied/i.test(message) ? "Cancelaste la firma."
        : message.startsWith("La transacción") ? message
        : message.startsWith("Too many") ? friendlyProviderError(message)
        : "No se pudo cargar la wallet de tus agentes.")
    } finally {
      setBusy(null)
    }
  }

  const withdraw = async () => {
    setBusy("withdraw")
    setError("")
    try {
      const response = await fetch("/api/agent-wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: account.address }),
      })
      const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; amountUsdc?: string; explorerUrl?: string }
      if (!response.ok || !data.ok) throw new Error(data.error || "No se pudo retirar.")
      setLast({ label: `Retiraste ${usdcLabel(data.amountUsdc ?? "0")} USDC a ${short(account.address)}`, url: data.explorerUrl ?? "" })
      await onDone()
    } catch (withdrawError) {
      setError(withdrawError instanceof Error ? friendlyProviderError(withdrawError.message) : "No se pudo retirar.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#050a12] px-3 py-2">
        <p className="min-w-0 truncate font-mono text-[11px] text-slate-300">{walletName} · {short(account.address)}</p>
        {wallet ? <DisconnectButton wallet={wallet} onDisconnect={onDisconnect} /> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void fund()} disabled={busy !== null} className={buttonClass}>{busy === "fund" ? <Activity className="h-4 w-4 animate-pulse" /> : null}{busy === "fund" ? "Firmando…" : `Cargar ${usdcLabel(status.fundUsdc)} USDC`}</button>
        {/* Nothing to withdraw from an empty wallet: the button only led to an English 409 error. */}
        {status.withdrawAvailable && mayHoldUsdc(status.balanceUsdc) ? <button type="button" onClick={() => void withdraw()} disabled={busy !== null} className={secondaryButtonClass}>{busy === "withdraw" ? "Retirando…" : "Retirar todo"}</button> : null}
      </div>
      {last ? <a href={last.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-200 underline">{last.label} <ExternalLink className="h-3 w-3" /></a> : null}
      {error ? <p role="alert" className="flex items-start gap-2 text-xs leading-5 text-rose-200"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p> : null}
    </div>
  )
}

const buttonClass = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-cyan-100 transition hover:bg-cyan-300/15 disabled:opacity-50"
const secondaryButtonClass = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-600 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
