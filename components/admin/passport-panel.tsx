"use client"

import { useState, useEffect, type ReactNode } from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import {
  Activity,
  Coins,
  Cpu,
  Database,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
} from "lucide-react"
import {
  CONTRACTS,
  currentNetwork,
  commitOnChain,
  loadPassportCollection,
  mintPassport,
  replaySpentProof,
  revokePassportLocal,
  savePassport,
  verifyOnChain,
  type MintedProof,
  type AgentPassport,
  type OnChainResult,
  type PassportCollection,
} from "@/lib/passport/passport"

const EXPLORER = (id: string) => `https://stellar.expert/explorer/${currentNetwork()}/contract/${id}`
const toStroops = (xlm: number) => BigInt(Math.round(xlm * 1e7)).toString()
const fromStroops = (s: string) => (Number(BigInt(s)) / 1e7).toLocaleString()
const short = (s = "", n = 14) => (s.length > n ? `${s.slice(0, n)}…` : s)

type PayResult = { authorized: boolean; reason: string; amount: number }

async function getFreighter() {
  try {
    const mod = await import("@stellar/freighter-api")
    return mod
  } catch {
    return null
  }
}

export function PassportPanel() {
  const [cap, setCap] = useState(50)
  const [payAmount, setPayAmount] = useState(20)
  const [minted, setMinted] = useState<MintedProof | null>(null)
  const [collection, setCollection] = useState<PassportCollection | null>(null)
  const [verifyRes, setVerifyRes] = useState<OnChainResult | null>(null)
  const [commitResult, setCommitResult] = useState<{ ok: boolean; hash?: string; error?: string } | null>(null)
  const [payRes, setPayRes] = useState<PayResult | null>(null)
  const [replay, setReplay] = useState<OnChainResult | null>(null)
  const [proving, setProving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [paying, setPaying] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const [freighterKey, setFreighterKey] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])

  const addLog = (line: string) =>
    setLog((l) => [...l, `${new Date().toLocaleTimeString()}  ${line}`].slice(-40))

  // Detect Freighter on mount so the register step knows if it's available
  useEffect(() => {
    getFreighter().then(async (f) => {
      if (!f) return
      try {
        const result = await f.isConnected()
        if (result) {
          const pkResult: any = await f.getPublicKey()
          const pk = typeof pkResult === "string" ? pkResult : pkResult?.publicKey
          if (pk) setFreighterKey(pk)
        }
      } catch { }
    })
  }, [])

  async function doMint() {
    setProving(true)
    setMinted(null)
    setVerifyRes(null)
    setCommitResult(null)
    setPayRes(null)
    addLog(`> generating witness + Groth16 proof client-side (cap ${cap} XLM)…`)
    try {
      const m = await mintPassport(toStroops(cap))
      setMinted(m)
      setCollection(loadPassportCollection(m.agentId))
      addLog(`+ proof generated in ${m.provingMs} ms · off-chain verify: ${m.offChainValid}`)
      addLog(`  agent #${m.agentId} · nullifier ${short(m.nullifierHash, 20)}`)
    } catch (e) {
      addLog(`! proving failed: ${String((e as Error).message)}`)
    } finally {
      setProving(false)
    }
  }

  async function doVerify() {
    if (!minted) return
    setVerifying(true)
    setVerifyRes(null)
    setCommitResult(null)
    addLog(`> simulating proof against AgentPassportValidator (read-only, no gas)…`)
    const r = await verifyOnChain(minted)
    setVerifyRes(r)
    addLog(
      r.ok
        ? `+ SIMULATION PASSED · proof is valid (ledger ${r.attestation?.ledger}) — register below to persist on-chain`
        : `! rejected: ${r.error}`,
    )
    setVerifying(false)
  }

  async function doCommit() {
    if (!minted || !verifyRes?.ok) return
    setCommitting(true)
    setCommitResult(null)

    let key = freighterKey
    const freighter = await getFreighter()
    if (!freighter) {
      addLog("! Freighter extension not found — install it at freighter.app")
      setCommitting(false)
      return
    }

    if (!key) {
      try {
        addLog(`> connecting Freighter…`)
        const accessResult: any = await freighter.requestAccess()
        key = typeof accessResult === "string" ? accessResult : accessResult?.address || accessResult?.publicKey
        if (!key) throw new Error("Could not get address from Freighter")
        setFreighterKey(key)
      } catch (e) {
        addLog(`! Freighter connect failed: ${String((e as Error).message)}`)
        setCommitting(false)
        return
      }
    }

    addLog(`> committing passport on Soroban (signing with ${key.slice(0, 8)}…)`)
    try {
      const signTransaction = async (xdr: string, opts?: object) => {
        const result: any = await freighter.signTransaction(xdr, {
          networkPassphrase: CONTRACTS.networkPassphrase,
          ...opts,
        })
        if (typeof result === "string") return { signedTxXdr: result }
        if (result?.signedTxXdr) return { signedTxXdr: result.signedTxXdr }
        throw new Error("Freighter did not return signed XDR")
      }

      const r = await commitOnChain(minted, key, signTransaction)
      setCommitResult(r)
      if (r.ok) setCollection(savePassport({ ...minted, txHash: r.hash, proof: minted }))
      addLog(
        r.ok
          ? `+ COMMITTED ON-CHAIN · tx ${r.hash ? short(r.hash, 16) : "confirmed"}`
          : `! commit failed: ${r.error}`,
      )
    } catch (e) {
      const msg = String((e as Error).message)
      setCommitResult({ ok: false, error: msg })
      addLog(`! commit error: ${msg}`)
    }
    setCommitting(false)
  }

  // x402 gate: the proven (hidden) spend cap covers the requested amount.
  async function doPay() {
    if (!verifyRes?.ok || !verifyRes.attestation) return
    setPaying(true)
    addLog(`> agent #${minted?.agentId} requests payment of ${payAmount} XLM (x402 gate)…`)
    const cap = BigInt(verifyRes.attestation.spend_cap)
    const amount = BigInt(toStroops(payAmount))
    const authorized = cap >= amount
    const reason = authorized ? "Within proven spend cap" : "Exceeds proven spend cap"
    setPayRes({ authorized, reason, amount: payAmount })
    addLog(authorized ? `+ APPROVED — ${reason}` : `x DENIED — ${reason}`)
    setPaying(false)
  }

  async function doReplay() {
    setReplaying(true)
    addLog(`> replaying a previously-spent passport (agent #42)…`)
    const r = await replaySpentProof()
    setReplay(r)
    addLog(r.ok ? `! unexpectedly accepted` : `+ chain rejected replay — ${r.error}`)
    setReplaying(false)
  }

  const committed = commitResult?.ok === true

  const PASSPORT_STEPS = ["Mint", "Simulate", "Register", "Pay", "Replay"]
  const reachedIdx = replay ? 4 : payRes ? 3 : committed ? 2 : verifyRes?.ok ? 1 : minted ? 0 : -1

  return (
    <TooltipPrimitive.Provider delayDuration={200}>
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      {/* LEFT — the 4-step flow */}
      <div className="space-y-4">
        {/* Step progress indicator */}
        <div className="flex items-center gap-1 px-1 pb-1">
          {PASSPORT_STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full items-center">
                {i > 0 && (
                  <div className={`h-px flex-1 transition-colors ${i <= reachedIdx + 1 ? "bg-cyan-500/60" : "bg-slate-800"}`} />
                )}
                <div
                  className={`h-2.5 w-2.5 rounded-full border transition-all ${
                    i <= reachedIdx
                      ? "border-cyan-400 bg-cyan-400"
                      : i === reachedIdx + 1
                      ? "border-cyan-400/60 bg-transparent"
                      : "border-slate-700 bg-transparent"
                  }`}
                />
                {i < PASSPORT_STEPS.length - 1 && (
                  <div className={`h-px flex-1 transition-colors ${i < reachedIdx ? "bg-cyan-500/60" : "bg-slate-800"}`} />
                )}
              </div>
              <span className={`text-[9px] uppercase tracking-[0.18em] ${i <= reachedIdx ? "text-cyan-400" : i === reachedIdx + 1 ? "text-slate-400" : "text-slate-700"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        <Step n="01" title="Mint passport" subtitle={<>Client-side <ZKTerm term="Groth16" tip="Zero-knowledge proof system. Groth16 generates a 192-byte proof off-chain that is verifiable in milliseconds on-chain." /> proof — keys never leave the browser</>}>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex-1 min-w-[180px]">
              <span className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Spend cap (XLM)</span>
              <input
                type="range"
                min={10}
                max={500}
                step={10}
                value={cap}
                onChange={(e) => setCap(Number(e.target.value))}
                className="mt-3 w-full accent-cyan-400"
              />
              <span className="mt-1 block font-mono text-sm text-cyan-200">{cap} XLM proven, hidden balance</span>
            </label>
            <button
              type="button"
              onClick={doMint}
              disabled={proving}
              className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-cyan-200 transition hover:border-cyan-300 disabled:opacity-50"
            >
              {proving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Fingerprint className="h-3.5 w-3.5" />}
              {proving ? "Proving…" : "Generate proof"}
            </button>
          </div>
          {minted && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Fact label="Agent id" value={`#${minted.agentId}`} />
              <Fact label="Proving time" value={`${minted.provingMs} ms`} />
              <Fact label="Off-chain valid" value={minted.offChainValid ? "true" : "false"} />
              <Fact label="Nullifier" value={short(minted.nullifierHash)} mono />
            </div>
          )}
        </Step>

        <Step n="02" title="Simulate on-chain verification" subtitle={<><ZKTerm term="BN254" tip="Barreto-Naehrig elliptic curve. BN254 enables efficient pairing operations used to verify Groth16 proofs in under 1ms on-chain." /> pairing checked by the <ZKTerm term="Soroban" tip="Stellar's smart contract platform. Soroban runs WebAssembly contracts with deterministic execution and Rust-friendly tooling." /> validator — read-only, no gas</>}>
          <button
            type="button"
            onClick={doVerify}
            disabled={!minted || verifying}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-200 disabled:opacity-40"
          >
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {verifying ? "Simulating…" : "Simulate verification"}
          </button>
          {verifyRes && (
            <div
              className={`mt-4 rounded-2xl border p-4 ${
                verifyRes.ok ? "border-amber-500/30 bg-amber-500/5" : "border-rose-500/30 bg-rose-500/5"
              }`}
            >
              {verifyRes.ok && verifyRes.attestation ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Fact label="Status" value="SIMULATION PASSED" tone="text-amber-300" />
                  <Fact label="Ledger (sim)" value={String(verifyRes.attestation.ledger)} />
                  <Fact label="Proven cap" value={`${fromStroops(verifyRes.attestation.spend_cap)} XLM`} />
                  <Fact label="Registry root" value={short(verifyRes.attestation.registry_root)} mono />
                </div>
              ) : (
                <p className="font-mono text-sm text-rose-300">Rejected — {verifyRes.error}</p>
              )}
            </div>
          )}
        </Step>

        {/* Step 02b — only visible after simulation passes */}
        {verifyRes?.ok && (
          <Step n="02b" title="Register on-chain" subtitle={<>Sign with Freighter to persist the passport on <ZKTerm term="Soroban" tip="Stellar's smart contract platform. Writing to it requires signing a transaction with your wallet." /> (costs gas)</>}>
            <div className="flex flex-wrap items-center gap-4">
              {freighterKey ? (
                <span className="font-mono text-[11px] text-slate-400">
                  Signer: {short(freighterKey, 14)}
                </span>
              ) : (
                <span className="font-mono text-[11px] text-slate-500">Freighter not connected</span>
              )}
              <button
                type="button"
                onClick={doCommit}
                disabled={committing || committed}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] transition disabled:opacity-40 ${
                  committed
                    ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border border-emerald-400/40 bg-emerald-400/10 text-emerald-200 hover:border-emerald-300"
                }`}
              >
                {committing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Database className="h-3.5 w-3.5" />
                )}
                {committing ? "Committing…" : committed ? "Committed ✓" : freighterKey ? "Register passport" : "Connect & Register"}
              </button>
            </div>
            {commitResult && (
              <div
                className={`mt-4 rounded-2xl border p-4 ${
                  commitResult.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"
                }`}
              >
                {commitResult.ok ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Fact label="Status" value="REGISTERED ON-CHAIN" tone="text-emerald-300" />
                    {commitResult.hash && <Fact label="Tx hash" value={short(commitResult.hash, 16)} mono />}
                  </div>
                ) : (
                  <p className="font-mono text-sm text-rose-300">Failed — {commitResult.error}</p>
                )}
              </div>
            )}
          </Step>
        )}

        <Step n="03" title="Authorize x402 payment" subtitle="Settles only if amount ≤ proven spend cap">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex-1 min-w-[180px]">
              <span className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Payment (XLM)</span>
              <input
                type="range"
                min={5}
                max={500}
                step={5}
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                className="mt-3 w-full accent-amber-400"
              />
              <span className="mt-1 block font-mono text-sm text-amber-200">{payAmount} XLM requested</span>
            </label>
            <button
              type="button"
              onClick={doPay}
              disabled={!verifyRes?.ok || paying}
              className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-amber-200 transition hover:border-amber-300 disabled:opacity-40"
            >
              {paying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Coins className="h-3.5 w-3.5" />}
              Request payment
            </button>
          </div>
          {payRes && (
            <p
              className={`mt-4 font-mono text-sm ${payRes.authorized ? "text-emerald-300" : "text-rose-300"}`}
            >
              {payRes.authorized ? "✓ APPROVED" : "✗ DENIED"} · {payRes.amount} XLM — {payRes.reason}
            </p>
          )}
        </Step>

        <Step n="04" title="Replay attack — blocked" subtitle="A real previously-spent proof is rejected on-chain (NullifierUsed)">
          <button
            type="button"
            onClick={doReplay}
            disabled={replaying}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-200 transition hover:border-rose-400/50 hover:text-rose-200 disabled:opacity-40"
          >
            {replaying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Replay spent proof
          </button>
          {replay && (
            <p className={`mt-4 font-mono text-sm ${replay.ok ? "text-rose-300" : "text-emerald-300"}`}>
              {replay.ok ? "! unexpectedly accepted" : `✓ chain rejected replay — ${replay.error}`}
            </p>
          )}
        </Step>
      </div>

      {/* RIGHT — credential + console + contracts */}
      <div className="space-y-4">
        <PassportCardMini cap={minted?.spendCap ?? toStroops(cap)} minted={minted} verified={!!verifyRes?.ok} committed={committed} />
        <PassportCollectionPanel collection={collection} onRevoke={(passport) => { setCollection(revokePassportLocal(passport)); addLog(`+ locally marked passport ${short(passport.nullifierHash, 12)} as revoked`) }} />


        <div className="rounded-[28px] border border-slate-800 bg-slate-950/80 p-5">
          <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Live console</p>
          <div className="mt-3 h-56 overflow-auto rounded-2xl border border-slate-800 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
            {log.length === 0 ? (
              <span className="text-slate-600">{"// waiting for the first proof…"}</span>
            ) : (
              log.map((l, i) => (
                <div key={i} className={l.includes("DENIED") || l.startsWith("!") ? "text-rose-300" : l.includes("APPROVED") || l.includes("VERIFIED") || l.includes("COMMITTED") ? "text-emerald-300" : l.includes("SIMULATION PASSED") ? "text-amber-300" : ""}>
                  {l}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-800 bg-slate-950/80 p-5 space-y-3">
          <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Deployed contracts ({currentNetwork()})</p>
          <ContractRow icon={<ShieldCheck className="h-4 w-4" />} label="Validator" id={CONTRACTS.validator} />
          <ContractRow icon={<Lock className="h-4 w-4" />} label="Groth16 verifier" id={CONTRACTS.verifier} />
        </div>
      </div>
    </div>
    </TooltipPrimitive.Provider>
  )
}

function ZKTerm({ term, tip }: { term: string; tip: string }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <span className="cursor-help border-b border-dotted border-slate-500 transition-colors hover:border-cyan-400 hover:text-cyan-300">
          {term}
        </span>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className="z-50 max-w-[260px] rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-300 shadow-xl"
          sideOffset={6}
        >
          {tip}
          <TooltipPrimitive.Arrow className="fill-slate-700" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

function Step({
  n,
  title,
  subtitle,
  children,
}: {
  n: string
  title: string
  subtitle: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-[28px] border border-slate-800 bg-slate-950/80 p-5 shadow-[0_24px_80px_rgba(2,8,23,0.45)] backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 font-mono text-[11px] text-cyan-300">
          {n}
        </span>
        <div>
          <h3 className="font-pixel text-sm uppercase text-slate-100">{title}</h3>
          <p className="mt-1 font-vt323 text-lg leading-5 text-slate-400">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Fact({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#09101a] p-3">
      <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className={`mt-1 text-sm ${mono ? "font-mono" : "font-mono"} ${tone ?? "text-slate-200"}`}>{value}</p>
    </div>
  )
}

function ContractRow({ icon, label, id }: { icon: ReactNode; label: string; id: string }) {
  return (
    <a
      href={EXPLORER(id)}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3 transition hover:border-cyan-400/40"
    >
      <div className="flex items-center gap-3">
        <span className="text-cyan-300">{icon}</span>
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{label}</p>
          <p className="mt-0.5 font-mono text-xs text-slate-300">{short(id, 18)}</p>
        </div>
      </div>
      <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
    </a>
  )
}

function PassportCollectionPanel({
  collection,
  onRevoke,
}: {
  collection: PassportCollection | null
  onRevoke: (passport: AgentPassport) => void
}) {
  if (!collection || collection.passports.length === 0) {
    return (
      <div className="rounded-[28px] border border-slate-800 bg-slate-950/80 p-5">
        <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Passport collection</p>
        <p className="mt-3 font-vt323 text-lg text-slate-400">No persisted passports yet. Register one to start history.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[28px] border border-slate-800 bg-slate-950/80 p-5">
      <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Passport collection</p>
      <p className="mt-2 font-mono text-[11px] text-slate-400">Agent #{collection.agentId} · primary {short(collection.primaryPassport, 18)}</p>
      <div className="mt-4 space-y-2">
        {collection.passports.map((passport) => {
          const expiresMs = new Date(passport.expiresAt).getTime() - Date.now()
          const expiresInDays = Math.max(0, Math.ceil(expiresMs / (24 * 60 * 60 * 1000)))
          const active = passport.status === "ACTIVE"
          return (
            <div key={passport.id} className="rounded-2xl border border-slate-800 bg-[#09101a] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-slate-200">{short(passport.nullifierHash, 18)}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    {active ? `${expiresInDays}d until expiry` : passport.status} · {fromStroops(passport.spendCap)} XLM
                  </p>
                </div>
                <span className={`font-mono text-[10px] ${active ? "text-emerald-300" : passport.status === "REVOKED" ? "text-rose-300" : "text-amber-300"}`}>
                  {passport.status}
                </span>
              </div>
              {active && (
                <button
                  type="button"
                  onClick={() => onRevoke(passport)}
                  className="mt-3 rounded-full border border-rose-400/30 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-rose-200 hover:border-rose-300"
                >
                  Revoke
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PassportCardMini({
  cap,
  minted,
  verified,
  committed,
}: {
  cap: string
  minted: MintedProof | null
  verified: boolean
  committed: boolean
}) {
  const status = committed ? "COMMITTED ON-CHAIN" : verified ? "SIMULATION OK" : minted ? "PROVEN" : "EMPTY"
  const tone = committed ? "text-emerald-300" : verified ? "text-amber-300" : minted ? "text-cyan-300" : "text-slate-500"
  return (
    <div className="rounded-[28px] border border-cyan-500/20 bg-gradient-to-br from-slate-950 to-[#06101c] p-5 shadow-[0_24px_80px_rgba(2,8,23,0.55)]">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-cyan-200">
          <KeyRound className="h-4 w-4" />
          <span className="font-pixel text-xs uppercase">Agent Passport</span>
        </div>
        <span className={`font-mono text-[11px] ${tone}`}>{status}</span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <CardStat icon={<Cpu className="h-3.5 w-3.5" />} label="Agent" value={minted ? `#${minted.agentId}` : "—"} />
        <CardStat icon={<Coins className="h-3.5 w-3.5" />} label="Spend cap" value={`${fromStroops(cap)} XLM`} />
        <CardStat icon={<Fingerprint className="h-3.5 w-3.5" />} label="Nullifier" value={minted ? short(minted.nullifierHash, 10) : "—"} />
        <CardStat icon={<Activity className="h-3.5 w-3.5" />} label="Proof" value={minted ? `${minted.provingMs}ms` : "—"} />
      </div>
      <p className="mt-5 font-vt323 text-base leading-5 text-slate-400">
        Owner key &amp; real balance never leave the browser — only the proof and its four public inputs go on-chain.
      </p>
    </div>
  )
}

function CardStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-black/30 p-3">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 font-mono text-sm text-slate-200">{value}</p>
    </div>
  )
}
