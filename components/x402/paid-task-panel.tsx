"use client"

import { useEffect, useMemo, useState } from "react"
import { useConnect, useDisconnect, useWallets } from "@wallet-standard/react"
import type { UiWallet, UiWalletAccount } from "@wallet-standard/react"
import { useWalletAccountTransactionSigner } from "@solana/react"
import { wrapFetchWithPayment, x402Client } from "@x402/fetch"
import { ExactSvmScheme } from "@x402/svm/exact/client"
import { Activity, CircleAlert, ExternalLink, Wallet } from "lucide-react"
import { AgentIdentityRow, ReviewAfterPayment } from "./agent-identity"
import { friendlyProviderError } from "@/lib/ai/friendly-error"

// Pay an agent per task with x402 on Solana devnet. The wallet signs a USDC transfer;
// the facilitator pays the network fee, so the user needs devnet USDC but no SOL.

const DEVNET_CAIP2 = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
const WALLET_CHAIN = "solana:devnet"
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com"
const CONNECTIONS_STORAGE_KEY = "agentic-city:connections:v1"
const CONNECTIONS_UPDATED_EVENT = "agentic-city:connections-updated"

type ProviderConnection = { id: string; provider: string; name: string; model: string; apiKey: string; auth?: "oauth" }
type TeamMember = { id: string; name: string; role: string; connectionId: string }
type Saved = { providers: ProviderConnection[]; team: { members: TeamMember[] } | null }
type Agent = { id: string; name: string; role: string; connection: ProviderConnection }
type Receipt = { transaction: string; explorerUrl: string; amount: string; payer: string | null }

function readAgents(): Agent[] {
  try {
    const saved = JSON.parse(localStorage.getItem(CONNECTIONS_STORAGE_KEY) || "{}") as Partial<Saved>
    const providers = Array.isArray(saved.providers) ? saved.providers.filter((item) => !/\bjev$/i.test(item.model)) : []
    const members = saved.team?.members ?? []
    const fromTeam = members.flatMap((member) => {
      const connection = providers.find((item) => item.id === member.connectionId)
      return connection ? [{ id: member.id, name: member.name, role: member.role, connection }] : []
    })
    if (fromTeam.length > 0) return fromTeam
    return providers.map((item) => ({ id: item.id, name: item.name, role: "General assistant", connection: item }))
  } catch {
    return []
  }
}

function supportsDevnetSigning(wallet: UiWallet) {
  return wallet.chains.includes(WALLET_CHAIN) && wallet.features.includes("solana:signTransaction")
}

export function PaidTaskPanel() {
  const wallets = useWallets().filter(supportsDevnetSigning)
  const [account, setAccount] = useState<UiWalletAccount | null>(null)
  const [walletName, setWalletName] = useState("")

  return (
    <section className="rounded-lg border border-emerald-300/20 bg-emerald-300/[.035] p-3">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-2.5 text-emerald-200"><Wallet className="h-4 w-4" /></div>
        <div>
          <p className="text-[9px] uppercase tracking-[.28em] text-slate-500">x402 · Solana devnet</p>
          <h3 className="mt-1 font-pixel text-sm uppercase text-slate-100">Pagarle a un agente</h3>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-400">Cada tarea cuesta 0,01 USDC de devnet. Firmás el pago con tu wallet y la red no te cobra comisión en SOL.</p>

      {account ? (
        <PayForm account={account} walletName={walletName} onDisconnect={() => setAccount(null)} wallet={wallets.find((item) => item.name === walletName)} />
      ) : wallets.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-amber-100">No encontramos una wallet de Solana compatible. Instalá <a className="underline" href="https://phantom.com/download" target="_blank" rel="noreferrer">Phantom</a> o Solflare y recargá la página.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {wallets.map((wallet) => <ConnectButton key={wallet.name} wallet={wallet} onConnected={(next) => { setAccount(next); setWalletName(wallet.name) }} />)}
        </div>
      )}
    </section>
  )
}

function ConnectButton({ wallet, onConnected }: { wallet: UiWallet; onConnected: (account: UiWalletAccount) => void }) {
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
      }} className={buttonClass}>
        {wallet.icon ? <img src={wallet.icon} alt="" className="h-4 w-4" /> : null} {connecting ? "Conectando…" : `Conectar ${wallet.name}`}
      </button>
      {error ? <p role="alert" className="mt-2 text-xs text-rose-200">{error}</p> : null}
    </div>
  )
}

function DisconnectButton({ wallet, onDisconnect }: { wallet: UiWallet; onDisconnect: () => void }) {
  const [busy, disconnect] = useDisconnect(wallet)
  return <button type="button" disabled={busy} onClick={() => { disconnect().finally(onDisconnect) }} className="text-[11px] text-slate-400 underline">Desconectar</button>
}

function PayForm({ account, wallet, walletName, onDisconnect }: { account: UiWalletAccount; wallet?: UiWallet; walletName: string; onDisconnect: () => void }) {
  const signer = useWalletAccountTransactionSigner(account, WALLET_CHAIN)
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentId, setAgentId] = useState("")
  const [task, setTask] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<{ text: string; receipt: Receipt; agentId: string } | null>(null)
  const [identityKey, setIdentityKey] = useState(0)

  useEffect(() => {
    const load = () => setAgents(readAgents())
    load()
    window.addEventListener(CONNECTIONS_UPDATED_EVENT, load)
    return () => window.removeEventListener(CONNECTIONS_UPDATED_EVENT, load)
  }, [])
  useEffect(() => {
    if (!agents.some((item) => item.id === agentId)) setAgentId(agents[0]?.id ?? "")
  }, [agents, agentId])

  const payingFetch = useMemo(() => {
    const client = new x402Client().register(DEVNET_CAIP2, new ExactSvmScheme(signer, { rpcUrl: RPC_URL }))
    return wrapFetchWithPayment(fetch, client)
  }, [signer])

  const agent = agents.find((item) => item.id === agentId)

  const pay = async () => {
    if (!agent || !task.trim()) {
      setError("Elegí un agente y escribí la tarea.")
      return
    }
    setBusy(true)
    setError("")
    setResult(null)
    try {
      const response = await payingFetch(`/api/x402/agents/${encodeURIComponent(agent.id)}/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: task.trim(),
          agent: { name: agent.name, role: agent.role, connection: { provider: agent.connection.provider, model: agent.connection.model, apiKey: agent.connection.apiKey, auth: agent.connection.auth } },
        }),
      })
      const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; result?: string; receipt?: Receipt }
      if (data.receipt) setResult({ text: data.result ?? "", receipt: data.receipt, agentId: agent.id })
      if (!response.ok || !data.ok) throw new Error(data.error || `El pago no se completó (HTTP ${response.status}).`)
    } catch (payError) {
      const message = payError instanceof Error ? payError.message : "Falló el pago."
      setError(/insufficient|0x1\b|funds|InvalidAccountData|AccountNotFound/i.test(message) ? "Tu wallet no tiene USDC de devnet (o no le alcanza). Cargá en faucet.circle.com → Solana Devnet y probá de nuevo." : friendlyProviderError(message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#050a12] px-3 py-2">
        <p className="min-w-0 truncate font-mono text-[11px] text-slate-300">{walletName} · {account.address.slice(0, 4)}…{account.address.slice(-4)}</p>
        {wallet ? <DisconnectButton wallet={wallet} onDisconnect={onDisconnect} /> : null}
      </div>
      {agents.length === 0 ? <p className="text-xs leading-5 text-slate-400">Primero conectá OpenRouter y agregá un modelo en “Modelos IA”.</p> : <>
        <label className="block space-y-1.5"><span className={labelClass}>Agente</span>
          <select value={agentId} onChange={(event) => setAgentId(event.target.value)} className={inputClass}>{agents.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.connection.model}</option>)}</select>
        </label>
        {agent ? <AgentIdentityRow agent={{ id: agent.id, name: agent.name, role: agent.role, model: agent.connection.model }} refreshKey={identityKey} /> : null}
        <label className="block space-y-1.5"><span className={labelClass}>Tarea</span>
          <textarea value={task} onChange={(event) => setTask(event.target.value)} maxLength={2000} className={`${inputClass} min-h-24 resize-y`} placeholder="Ej.: resumí las ventajas de x402 para cobrar APIs a agentes" />
        </label>
        <button type="button" onClick={() => void pay()} disabled={busy} className={buttonClass}>{busy ? <Activity className="h-4 w-4 animate-pulse" /> : null}{busy ? "Firmando y ejecutando…" : "Pagar 0,01 USDC y ejecutar"}</button>
      </>}
      {error ? <p role="alert" className="flex items-start gap-2 text-xs leading-5 text-rose-200"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p> : null}
      {result ? <div className="space-y-2 rounded-lg border border-slate-800 bg-[#050a12] p-3">
        {result.text ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{result.text}</p> : null}
        <a href={result.receipt.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-200 underline">Pago verificado en devnet <ExternalLink className="h-3 w-3" /></a>
        <ReviewAfterPayment account={account} agentId={result.agentId} paymentSignature={result.receipt.transaction} onReviewed={() => setIdentityKey((value) => value + 1)} />
      </div> : null}
      <p className="text-[11px] leading-5 text-slate-500">¿Sin USDC de prueba? <a className="underline" href="https://faucet.circle.com/" target="_blank" rel="noreferrer">faucet.circle.com</a> → Solana Devnet.</p>
    </div>
  )
}

const labelClass = "block text-[10px] font-semibold uppercase tracking-[.2em] text-slate-400"
const inputClass = "w-full rounded-xl border border-slate-700/80 bg-[#050a12] px-3 py-2.5 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-300/60"
const buttonClass = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-100 transition hover:bg-emerald-300/15 disabled:opacity-50"
