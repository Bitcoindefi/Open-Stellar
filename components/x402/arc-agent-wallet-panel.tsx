"use client"

import { useCallback, useEffect, useState } from "react"
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract } from "wagmi"
import { erc20Abi } from "viem"
import { Activity, Bot, CircleAlert, Copy, Droplets, ExternalLink, RefreshCw } from "lucide-react"
import { mayHoldUsdc, usdcLabel } from "@/lib/agent-wallet/format"
import { friendlyProviderError } from "@/lib/ai/friendly-error"
import { ARC_FAUCET_URL, ARC_FUND_AMOUNT_MICRO, ARC_TESTNET_CHAIN_ID, ARC_USDC_ADDRESS, arcExplorerTxUrl, isEvmAddress, sameEvmAddress } from "@/lib/rails/arc/constants"

// "La wallet de tus agentes" on Arc testnet: a separate EVM wallet of this browser (its key lives
// only in its own encrypted httpOnly cookie) that pays the x402 hires when "Red de pago" is Arc.
// The person funds it with a plain USDC transfer from MetaMask (gas is paid in USDC too) and can
// withdraw everything back, minus a small gas reserve.

export type ArcAgentWalletStatus = {
  ok: boolean
  error?: string
  address: string
  balanceUsdc: string | null
  fundUsdc: string
  hirePriceUsdc: string
  caps: { perRunUsdc: string; perDayUsdc: string }
  spentTodayUsdc: string
  gasReserveUsdc: string
  withdrawAvailable: boolean
  faucetUrl: string
  explorerUrl: string
}

function short(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

export function ArcAgentWalletPanel({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<ArcAgentWalletStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/agent-wallet?network=arc", { cache: "no-store" })
      const data = await response.json().catch(() => ({})) as ArcAgentWalletStatus
      if (!response.ok || !data.ok) throw new Error(data.error || "No pudimos abrir la wallet de tus agentes en Arc.")
      setStatus(data)
      setError("")
    } catch (loadError) {
      setError(loadError instanceof Error ? friendlyProviderError(loadError.message) : "No pudimos abrir la wallet de tus agentes en Arc.")
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

  return (
    <section aria-label="Wallet de tus agentes en Arc" className={`rounded-lg border border-violet-300/25 bg-violet-300/[.04] ${compact ? "p-2.5" : "p-3"}`}>
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-violet-300/25 bg-violet-300/10 p-2.5 text-violet-200"><Bot className="h-4 w-4" /></div>
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[.28em] text-slate-500">Sin login · Arc testnet</p>
          <h3 className="mt-1 font-pixel text-sm uppercase text-slate-100">La wallet de tus agentes</h3>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} aria-label="Actualizar saldo" className="ml-auto rounded-lg border border-slate-700 p-2 text-slate-400 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></button>
      </div>

      {status ? <>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-800 bg-[#050a12] px-3 py-2">
          <a href={status.explorerUrl} target="_blank" rel="noreferrer" className="min-w-0 truncate font-mono text-[11px] text-violet-100 underline">{short(status.address)}</a>
          <button type="button" onClick={() => void copy()} aria-label="Copiar dirección" className="text-slate-400"><Copy className="h-3.5 w-3.5" /></button>
          {copied ? <span className="text-[10px] text-emerald-200">Copiada</span> : null}
          <span className="ml-auto font-mono text-sm text-slate-100" data-testid="arc-wallet-balance">{status.balanceUsdc === null ? "…" : `${usdcLabel(status.balanceUsdc)} USDC`}</span>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">
          Paga {usdcLabel(status.hirePriceUsdc)} USDC cada vez que un agente contrata a otro en el chat (el facilitador de Circle paga el gas). Tope sin preguntarte: {usdcLabel(status.caps.perRunUsdc)} por conversación y {usdcLabel(status.caps.perDayUsdc)} por día (hoy: {usdcLabel(status.spentTodayUsdc)}). En Arc el gas se paga en USDC: no necesitás otro token.
        </p>
        <FundActions status={status} onDone={load} />
        <a href={status.faucetUrl || ARC_FAUCET_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-violet-200 underline">
          <Droplets className="h-3.5 w-3.5" aria-hidden="true" /> USDC de prueba gratis: faucet.circle.com → Arc Testnet
        </a>
        <p className="mt-3 text-[10px] leading-4 text-slate-500">Es una wallet distinta de la de Solana. La clave vive solo en una cookie cifrada de este navegador; no la guardamos en ningún otro lado. Si borrás las cookies perdés lo que quede adentro (es testnet): antes, usá “Retirar todo”.</p>
      </> : loading ? <p className="mt-3 text-xs text-slate-400">Abriendo la wallet…</p> : null}

      {error ? <p role="alert" className="mt-2 flex items-start gap-2 text-xs leading-5 text-rose-200"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p> : null}
    </section>
  )
}

function FundActions({ status, onDone }: { status: ArcAgentWalletStatus; onDone: () => Promise<void> }) {
  const { address, isConnected, chainId } = useAccount()
  const { connectors, connectAsync } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState<"connect" | "fund" | "withdraw" | null>(null)
  const [error, setError] = useState("")
  const [last, setLast] = useState<{ label: string; url: string } | null>(null)
  const injectedConnector = connectors.find((item) => item.type === "injected")

  const connect = async () => {
    if (!injectedConnector) return
    setBusy("connect")
    setError("")
    try {
      await connectAsync({ connector: injectedConnector, chainId: ARC_TESTNET_CHAIN_ID })
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : ""
      setError(/reject|denied|cancel/i.test(message) ? "Cancelaste la conexión." : "No se pudo conectar tu wallet.")
    } finally {
      setBusy(null)
    }
  }

  const refreshSoon = async () => {
    // Arc is final in under a second; one or two reads catch the new balance.
    for (let i = 0; i < 2; i++) {
      await new Promise((resolve) => window.setTimeout(resolve, 1500))
      await onDone()
    }
  }

  const fund = async () => {
    if (!address) return
    setBusy("fund")
    setError("")
    try {
      if (!isEvmAddress(status.address) || sameEvmAddress(status.address, address)) throw new Error("La dirección de la wallet de tus agentes no es válida.")
      // Adds Arc testnet to MetaMask when it is missing (wallet_addEthereumChain), then switches.
      if (chainId !== ARC_TESTNET_CHAIN_ID) await switchChainAsync({ chainId: ARC_TESTNET_CHAIN_ID })
      const hash = await writeContractAsync({
        address: ARC_USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "transfer",
        args: [status.address as `0x${string}`, ARC_FUND_AMOUNT_MICRO],
        chainId: ARC_TESTNET_CHAIN_ID,
      })
      setLast({ label: `Cargaste ${usdcLabel(status.fundUsdc)} USDC`, url: arcExplorerTxUrl(hash) })
      setBusy(null)
      await refreshSoon()
    } catch (fundError) {
      const message = fundError instanceof Error ? fundError.message : ""
      setError(/insufficient|exceeds balance|funds/i.test(message)
        ? "Tu wallet no tiene USDC suficiente en Arc testnet. Pedí en faucet.circle.com → Arc Testnet."
        : /reject|denied|cancel/i.test(message) ? "Cancelaste la firma."
        : message.startsWith("La dirección") ? message
        : "No se pudo cargar la wallet de tus agentes.")
    } finally {
      setBusy(null)
    }
  }

  const withdraw = async () => {
    if (!address) return
    setBusy("withdraw")
    setError("")
    try {
      const response = await fetch("/api/agent-wallet/withdraw?network=arc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: address }),
      })
      const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; amountUsdc?: string; explorerUrl?: string }
      if (!response.ok || !data.ok) throw new Error(data.error || "No se pudo retirar.")
      setLast({ label: `Retiraste ${usdcLabel(data.amountUsdc ?? "0")} USDC a ${short(address)}`, url: data.explorerUrl ?? "" })
      await onDone()
    } catch (withdrawError) {
      setError(withdrawError instanceof Error ? friendlyProviderError(withdrawError.message) : "No se pudo retirar.")
    } finally {
      setBusy(null)
    }
  }

  if (!isConnected || !address) {
    return injectedConnector ? (
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void connect()} disabled={busy !== null} className={buttonClass}>{busy === "connect" ? "Conectando…" : "Conectar MetaMask"}</button>
        {error ? <p role="alert" className="w-full text-xs text-rose-200">{error}</p> : null}
      </div>
    ) : (
      <p className="mt-3 text-xs leading-5 text-amber-100">Para cargarla necesitás <a className="underline" href="https://metamask.io/download" target="_blank" rel="noreferrer">MetaMask</a> u otra wallet EVM con USDC de Arc testnet.</p>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#050a12] px-3 py-2">
        <p className="min-w-0 truncate font-mono text-[11px] text-slate-300">Tu wallet · {short(address)}</p>
        <button type="button" onClick={() => disconnect()} className="text-[10px] uppercase tracking-wider text-slate-400 underline">Desconectar</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void fund()} disabled={busy !== null} className={buttonClass}>{busy === "fund" ? <Activity className="h-4 w-4 animate-pulse" /> : null}{busy === "fund" ? "Firmando…" : `Cargar ${usdcLabel(status.fundUsdc)} USDC`}</button>
        {status.withdrawAvailable && mayHoldUsdc(status.balanceUsdc) ? <button type="button" onClick={() => void withdraw()} disabled={busy !== null} className={secondaryButtonClass}>{busy === "withdraw" ? "Retirando…" : "Retirar todo"}</button> : null}
      </div>
      <p className="text-[10px] leading-4 text-slate-500">Al retirar quedan {usdcLabel(status.gasReserveUsdc)} USDC para pagar el gas de esa transferencia.</p>
      {last ? <a href={last.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-200 underline">{last.label} <ExternalLink className="h-3 w-3" /></a> : null}
      {error ? <p role="alert" className="flex items-start gap-2 text-xs leading-5 text-rose-200"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p> : null}
    </div>
  )
}

const buttonClass = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-300/30 bg-violet-300/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-violet-100 transition hover:bg-violet-300/15 disabled:opacity-50"
const secondaryButtonClass = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-600 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
