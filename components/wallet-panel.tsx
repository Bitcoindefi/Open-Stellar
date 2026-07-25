"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import type { MoltbotAgent, WalletTransaction } from "@/lib/types"

interface X402QuoteView {
  paymentRef: string
  amountUsd: number
  expiresAt: string
  chain: "bnb" | "stellar"
}

interface WalletPanelProps {
  agents: MoltbotAgent[]
  selectedAgent: MoltbotAgent | null
  transactions: WalletTransaction[]
  onUpdateAgent: (agentId: string, wallet: MoltbotAgent["wallet"]) => void
  onAddTransaction: (tx: WalletTransaction) => void
}

function truncAddr(addr: string) {
  if (addr.length <= 14) return addr
  return addr.slice(0, 6) + "..." + addr.slice(-6)
}

async function getFreighter() {
  try {
    const mod = await import("@stellar/freighter-api")
    return mod
  } catch {
    return null
  }
}

function WalletBtn({ label, onClick, disabled, color }: { label: string; onClick: () => void; disabled?: boolean; color: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 12px",
        background: disabled ? "#1e293b" : color + "22",
        color: disabled ? "#475569" : color,
        border: `1px solid ${disabled ? "#1e293b" : color + "44"}`,
        borderRadius: 4,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "monospace",
        fontSize: 10,
        fontWeight: 600,
        transition: "all 0.15s",
        opacity: disabled ? 0.5 : 1,
        width: "100%",
      }}
    >
      {label}
    </button>
  )
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { }
  }

  return (
    <button
      onClick={handleCopy}
      title={`Copy ${label ?? "address"}`}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "2px 4px",
        color: copied ? "#34d399" : "#475569",
        fontFamily: "monospace",
        fontSize: 9,
        transition: "color 0.15s",
        flexShrink: 0,
      }}
    >
      {copied ? "✓" : "⎘"}
    </button>
  )
}

export function WalletPanel({ agents, selectedAgent, transactions, onUpdateAgent, onAddTransaction }: WalletPanelProps) {
  const [freighterAvailable, setFreighterAvailable] = useState<boolean | null>(null)
  const [connectedKey, setConnectedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sendTo, setSendTo] = useState("")
  const [sendAmount, setSendAmount] = useState("10")
  const [track8004Mode, setTrack8004Mode] = useState<"native-8004" | "reputation-fallback" | null>(null)
  const [reputationScore, setReputationScore] = useState<number | null>(null)
  const [x402Quote, setX402Quote] = useState<X402QuoteView | null>(null)
  const [x402Countdown, setX402Countdown] = useState<number | null>(null)
  const [penaltyConfirm, setPenaltyConfirm] = useState(false)
  const [assignConfirm, setAssignConfirm] = useState(false)

  // Check Freighter availability on mount
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const freighter = await getFreighter()
      if (cancelled) return
      if (!freighter) { setFreighterAvailable(false); return }
      try {
        const result = await freighter.isConnected()
        if (cancelled) return
        setFreighterAvailable(!!result)
        if (result) {
          try {
            const pkResult: any = await freighter.getPublicKey()
            const publicKey = typeof pkResult === "string" ? pkResult : pkResult?.publicKey
            if (!cancelled && publicKey) {
              setConnectedKey(publicKey)
            }
          } catch {
            // Not yet authorized
          }
        }
      } catch {
        if (!cancelled) setFreighterAvailable(false)
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  // Poll every 3s until Freighter is detected
  useEffect(() => {
    if (freighterAvailable !== false) return
    const id = setInterval(async () => {
      const freighter = await getFreighter()
      if (!freighter) return
      try {
        const result = await freighter.isConnected()
        if (result) setFreighterAvailable(true)
      } catch { }
    }, 3000)
    return () => clearInterval(id)
  }, [freighterAvailable])

  // x402 live countdown
  useEffect(() => {
    if (!x402Quote) {
      setX402Countdown(null)
      return
    }
    const update = () => {
      const remaining = Math.max(0, Math.floor((new Date(x402Quote.expiresAt).getTime() - Date.now()) / 1000))
      setX402Countdown(remaining)
      if (remaining === 0) {
        setX402Quote(null)
        toast("x402 quote expired — generate a new one", { icon: "⏱" })
      }
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [x402Quote])

  const handleConnect = useCallback(async () => {
    setLoading("connect")
    setError(null)
    try {
      const freighter = await getFreighter()
      if (!freighter) throw new Error("Freighter not found")

      const accessResult: any = await freighter.requestAccess()
      const publicKey = typeof accessResult === "string" ? accessResult : accessResult?.address || accessResult?.publicKey
      if (publicKey) {
        setConnectedKey(publicKey)
      } else {
        throw new Error("Could not get address from Freighter")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect Freighter")
    }
    setLoading(null)
  }, [])

  const handleAssignWallet = useCallback(async (agent: MoltbotAgent) => {
    if (!connectedKey) return
    setLoading("assign")
    setError(null)
    setAssignConfirm(false)
    onUpdateAgent(agent.id, {
      publicKey: connectedKey,
      balance: "0",
      funded: false,
    })
    try {
      const res = await fetch("/api/stellar/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: connectedKey }),
      })
      const data = await res.json()
      if (data.balance && parseFloat(data.balance) > 0) {
        onUpdateAgent(agent.id, {
          publicKey: connectedKey,
          balance: data.balance,
          funded: true,
        })
      }
    } catch {
      // Ignore -- new account may not exist yet
    }
    toast.success(`Wallet assigned to ${agent.name}`)
    setLoading(null)
  }, [connectedKey, onUpdateAgent])

  const handleFund = useCallback(async (agent: MoltbotAgent) => {
    if (!agent.wallet) return
    setLoading("fund")
    setError(null)
    try {
      const res = await fetch("/api/stellar/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: agent.wallet.publicKey }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      onUpdateAgent(agent.id, { ...agent.wallet, balance: data.balance || "10000", funded: true })
      toast.success(`${agent.name} funded with 10,000 XLM via Friendbot`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Friendbot funding failed"
      setError(msg)
      toast.error("Funding failed", { description: msg })
    }
    setLoading(null)
  }, [onUpdateAgent])

  const handleRefresh = useCallback(async (agent: MoltbotAgent) => {
    if (!agent.wallet) return
    setLoading("refresh")
    setError(null)
    try {
      const res = await fetch("/api/stellar/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: agent.wallet.publicKey }),
      })
      const data = await res.json()
      if (data.error === "network") {
        setError("Balance fetch failed — Stellar testnet may be unreachable")
      } else {
        const bal = data.balance || "0"
        onUpdateAgent(agent.id, { ...agent.wallet, balance: bal, funded: parseFloat(bal) > 0 })
      }
    } catch {
      setError("Balance refresh failed")
    }
    setLoading(null)
  }, [onUpdateAgent])

  const handleSend = useCallback(async (agent: MoltbotAgent) => {
    if (!agent.wallet || !sendTo || !sendAmount) return

    const amountNum = parseFloat(sendAmount)
    if (!amountNum || amountNum <= 0) {
      setError("Amount must be greater than 0")
      return
    }
    const currentBalance = parseFloat(agent.wallet.balance)
    if (amountNum >= currentBalance - 1) {
      setError(`Max sendable: ${Math.max(0, currentBalance - 1).toFixed(2)} XLM (1 XLM reserve required)`)
      return
    }

    const recipient = agents.find(a => a.id === sendTo)
    if (!recipient?.wallet?.funded) {
      setError("Recipient has no funded wallet")
      return
    }
    setLoading("send")
    setError(null)
    try {
      const buildRes = await fetch("/api/stellar/build-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePublic: agent.wallet.publicKey,
          destination: recipient.wallet.publicKey,
          amount: amountNum.toFixed(7),
        }),
      })
      const buildData = await buildRes.json()
      if (buildData.error) throw new Error(buildData.error)

      const freighter = await getFreighter()
      if (!freighter) throw new Error("Freighter not available")

      const signResult: any = await freighter.signTransaction(buildData.xdr, {
        networkPassphrase: "Test SDF Network ; September 2015",
      })

      const signedXdr =
        typeof signResult === "string"
          ? signResult
          : signResult && typeof signResult === "object" && "signedTxXdr" in signResult
          ? (signResult.signedTxXdr as string)
          : null

      if (!signedXdr) throw new Error("Freighter did not return signed XDR")

      const submitRes = await fetch("/api/stellar/submit-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedXdr }),
      })
      const submitData = await submitRes.json()
      if (submitData.error) throw new Error(submitData.error)

      const [fromBal, toBal] = await Promise.all([
        fetch("/api/stellar/balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicKey: agent.wallet.publicKey }),
        }).then(r => r.json()),
        fetch("/api/stellar/balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicKey: recipient.wallet.publicKey }),
        }).then(r => r.json()),
      ])

      onUpdateAgent(agent.id, { ...agent.wallet, balance: fromBal.balance || "0" })
      onUpdateAgent(recipient.id, { ...recipient.wallet, balance: toBal.balance || "0" })

      const txId = Date.now()
      onAddTransaction({
        id: txId,
        fromName: agent.name,
        toName: recipient.name,
        amount: sendAmount,
        timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
        hash: submitData.hash || "unknown",
      })

      toast.success(`Sent ${sendAmount} XLM to ${recipient.name}`, {
        description: submitData.hash ? `tx: ${submitData.hash.slice(0, 18)}…` : undefined,
      })

      setSendAmount("10")
      setSendTo("")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed"
      setError(msg)
      toast.error("Transaction failed", { description: msg })
    }
    setLoading(null)
  }, [agents, sendTo, sendAmount, onUpdateAgent, onAddTransaction])

  useEffect(() => {
    if (!selectedAgent) return

    let cancelled = false
    const syncProtocolState = async () => {
      try {
        const [trackRes, repRes] = await Promise.all([
          fetch("/api/protocol/track8004?chain=stellar"),
          fetch(`/api/protocol/reputation?actorId=${encodeURIComponent(selectedAgent.id)}`),
        ])

        const trackData = await trackRes.json()
        const repData = await repRes.json()

        if (!cancelled) {
          setTrack8004Mode(trackData?.resolution?.mode || null)
          setReputationScore(typeof repData?.reputation?.score === "number" ? repData.reputation.score : null)
        }
      } catch {
        if (!cancelled) {
          setTrack8004Mode(null)
          setReputationScore(null)
        }
      }
    }

    syncProtocolState()
    return () => { cancelled = true }
  }, [selectedAgent])

  const applyReputation = useCallback(async (agentId: string, delta: number, reason: string) => {
    const res = await fetch("/api/protocol/reputation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorId: agentId, delta, reason, scope: "tx" }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || "Reputation update failed")
    setReputationScore(typeof data?.reputation?.score === "number" ? data.reputation.score : null)
  }, [])

  const handleCreateX402Quote = useCallback(async (agent: MoltbotAgent) => {
    setLoading("x402-quote")
    setError(null)
    try {
      const res = await fetch("/api/protocol/x402/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: `npc-${agent.id}-service`,
          chain: "stellar",
          payer: agent.id,
          units: 1,
          unitPriceUsd: 0.05,
          ttlSeconds: 300,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data?.quote) throw new Error(data?.error || "x402 quote failed")

      setX402Quote({
        paymentRef: data.quote.paymentRef,
        amountUsd: Number(data.quote.amountUsd || 0),
        expiresAt: String(data.quote.expiresAt || ""),
        chain: data.quote.chain === "bnb" ? "bnb" : "stellar",
      })
      toast("x402 quote created — 5 min to settle", { icon: "📋" })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "x402 quote failed"
      setError(msg)
      toast.error("Quote failed", { description: msg })
    }
    setLoading(null)
  }, [])

  const handleSettleX402 = useCallback(async (agent: MoltbotAgent) => {
    if (!x402Quote) return
    setLoading("x402-settle")
    setError(null)
    try {
      const mockTxHash = `0x${Date.now().toString(16).padStart(64, "0").slice(-64)}`
      const settleRes = await fetch("/api/protocol/x402/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentRef: x402Quote.paymentRef,
          chain: x402Quote.chain,
          txHash: mockTxHash,
          paidBy: agent.id,
        }),
      })
      const settleData = await settleRes.json()
      if (!settleRes.ok) throw new Error(settleData?.error || "x402 settlement failed")

      await applyReputation(agent.id, 15, "successful-x402-settlement")
      setX402Quote(null)
      toast.success("x402 settled — +15 reputation", { description: `${x402Quote.amountUsd.toFixed(3)} USD on ${x402Quote.chain}` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "x402 settlement failed"
      setError(msg)
      toast.error("Settlement failed", { description: msg })
    }
    setLoading(null)
  }, [applyReputation, x402Quote])

  // -- Render --

  const renderFreighterStatus = () => {
    if (freighterAvailable === null) {
      return (
        <div style={{ padding: 16, fontFamily: "monospace", fontSize: 11, color: "#64748b", textAlign: "center" }}>
          Checking Freighter wallet...
        </div>
      )
    }

    if (!freighterAvailable) {
      return (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#f87171", fontWeight: 700 }}>
            Freighter Not Detected
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b", textAlign: "center", lineHeight: 1.5 }}>
            Install the Freighter browser extension to connect your Stellar wallet.
          </div>
          <a
            href="https://www.freighter.app/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "8px 16px",
              background: "#22d3ee22",
              color: "#22d3ee",
              border: "1px solid #22d3ee44",
              borderRadius: 4,
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Get Freighter
          </a>
          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", textAlign: "center" }}>
            Stellar Testnet only
          </div>
        </div>
      )
    }

    if (!connectedKey) {
      return (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 28, opacity: 0.3, fontFamily: "monospace" }}>XLM</div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b", textAlign: "center" }}>
            Freighter detected. Connect to manage bot wallets.
          </div>
          <WalletBtn
            label={loading === "connect" ? "Connecting..." : "Connect Freighter Wallet"}
            onClick={handleConnect}
            disabled={loading !== null}
            color="#22d3ee"
          />
          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", textAlign: "center" }}>
            Stellar Testnet
          </div>
        </div>
      )
    }

    return null
  }

  const statusBanner = renderFreighterStatus()
  if (statusBanner) return statusBanner

  // No agent selected — show overview
  if (!selectedAgent) {
    return (
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
        {/* Connected address */}
        <div style={{ background: "#0f172a", borderRadius: 6, padding: 10, border: "1px solid #1e293b" }}>
          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 1 }}>
            Freighter Connected
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#22d3ee", wordBreak: "break-all", flex: 1 }}>
              {truncAddr(connectedKey!)}
            </div>
            <CopyBtn text={connectedKey!} label="address" />
          </div>
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399" }} />
            <span style={{ fontFamily: "monospace", fontSize: 9, color: "#34d399" }}>Online</span>
          </div>
        </div>

        {/* Empty state */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, gap: 8, opacity: 0.6 }}>
          <div style={{ fontSize: 24, opacity: 0.4 }}>←</div>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b", textAlign: "center", lineHeight: 1.5 }}>
            Click an agent on the map to assign and manage its Stellar wallet
          </span>
        </div>

        {/* All wallets overview */}
        <div style={{ padding: 10, background: "#0f172a", borderRadius: 6, border: "1px solid #1e293b", flex: 1, overflow: "auto" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            All Bot Wallets
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {agents.map(a => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#94a3b8", flex: 1 }}>
                  {a.name}
                </span>
                <span suppressHydrationWarning style={{ fontFamily: "monospace", fontSize: 10, color: a.wallet?.funded ? "#fbbf24" : "#334155" }}>
                  {a.wallet ? `${parseFloat(a.wallet.balance).toFixed(1)} XLM` : "---"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent transactions */}
        {transactions.length > 0 && (
          <div style={{ padding: 10, background: "#0f172a", borderRadius: 6, border: "1px solid #1e293b" }}>
            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              Recent Transactions
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...transactions].reverse().slice(0, 5).map(tx => (
                <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontFamily: "monospace" }}>
                  <span style={{ color: "#f87171" }}>{tx.fromName}</span>
                  <span style={{ color: "#334155" }}>{">"}</span>
                  <span style={{ color: "#34d399" }}>{tx.toName}</span>
                  <span style={{ color: "#fbbf24", marginLeft: "auto" }}>{tx.amount} XLM</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Selected agent wallet management
  const wallet = selectedAgent.wallet
  const otherFunded = agents.filter(a => a.id !== selectedAgent.id && a.wallet?.funded)

  const fmtCountdown = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0")
    const sec = (s % 60).toString().padStart(2, "0")
    return `${m}:${sec}`
  }

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", height: "100%" }}>
      {/* Connected Freighter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "#0f172a", borderRadius: 4, border: "1px solid #1e293b" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399" }} />
        <span style={{ fontFamily: "monospace", fontSize: 9, color: "#94a3b8", flex: 1 }}>
          {truncAddr(connectedKey!)}
        </span>
        <CopyBtn text={connectedKey!} label="address" />
        <span style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", background: "#1e293b", padding: "1px 5px", borderRadius: 3 }}>
          TESTNET
        </span>
      </div>

      {/* Agent header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, borderBottom: "1px solid #1e293b" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: selectedAgent.color }} />
        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: selectedAgent.color }}>
          {selectedAgent.name}
        </span>
      </div>

      {!wallet ? (
        /* No wallet assigned */
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 16 }}>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b", textAlign: "center" }}>
            No wallet assigned to this bot.
          </div>
          {!assignConfirm ? (
            <>
              <WalletBtn
                label="Assign Freighter Wallet"
                onClick={() => setAssignConfirm(true)}
                disabled={loading !== null}
                color={selectedAgent.color}
              />
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", textAlign: "center" }}>
                Links your connected Freighter account to this bot
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "#fbbf24", textAlign: "center" }}>
                Assign {truncAddr(connectedKey!)} to {selectedAgent.name}?
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, width: "100%" }}>
                <WalletBtn
                  label={loading === "assign" ? "Assigning..." : "Confirm"}
                  onClick={() => handleAssignWallet(selectedAgent)}
                  disabled={loading !== null}
                  color="#34d399"
                />
                <WalletBtn
                  label="Cancel"
                  onClick={() => setAssignConfirm(false)}
                  disabled={loading !== null}
                  color="#64748b"
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Wallet info card */}
          <div style={{ background: "#0f172a", borderRadius: 6, padding: 10, border: "1px solid #1e293b" }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 1 }}>
              Public Key
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8", wordBreak: "break-all", flex: 1 }}>
                {truncAddr(wallet.publicKey)}
              </div>
              <CopyBtn text={wallet.publicKey} label="public key" />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              <div>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 1 }}>
                  Balance
                </div>
                <div suppressHydrationWarning style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "#fbbf24", marginTop: 2 }}>
                  {parseFloat(wallet.balance).toFixed(2)} XLM
                </div>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <WalletBtn
                  label={loading === "refresh" ? "..." : "Refresh"}
                  onClick={() => handleRefresh(selectedAgent)}
                  disabled={loading !== null}
                  color="#64748b"
                />
              </div>
            </div>
          </div>

          {/* Fund button */}
          {!wallet.funded && (
            <WalletBtn
              label={loading === "fund" ? "Funding via Friendbot..." : "Fund with Friendbot (10,000 XLM)"}
              onClick={() => handleFund(selectedAgent)}
              disabled={loading !== null}
              color="#34d399"
            />
          )}

          {/* Send payment */}
          {wallet.funded && (
            <div style={{ background: "#0f172a", borderRadius: 6, padding: 10, border: "1px solid #1e293b" }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                Send XLM (signed via Freighter)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <select
                  value={sendTo}
                  onChange={e => setSendTo(e.target.value)}
                  style={{
                    background: "#111827",
                    border: "1px solid #1e293b",
                    borderRadius: 4,
                    padding: "6px 8px",
                    fontFamily: "monospace",
                    fontSize: 11,
                    color: "#e2e8f0",
                    outline: "none",
                  }}
                >
                  <option value="">Select recipient bot...</option>
                  {otherFunded.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({truncAddr(a.wallet!.publicKey)})</option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="number"
                    value={sendAmount}
                    onChange={e => setSendAmount(e.target.value)}
                    min="0.0000001"
                    step="0.01"
                    placeholder="Amount XLM"
                    style={{
                      flex: 1,
                      background: "#111827",
                      border: "1px solid #1e293b",
                      borderRadius: 4,
                      padding: "6px 8px",
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: "#e2e8f0",
                      outline: "none",
                    }}
                  />
                  <WalletBtn
                    label={loading === "send" ? "Signing..." : "Send"}
                    onClick={() => handleSend(selectedAgent)}
                    disabled={loading !== null || !sendTo || !sendAmount}
                    color="#fbbf24"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Protocol Layer */}
          <div style={{ background: "#0f172a", borderRadius: 6, padding: 10, border: "1px solid #1e293b", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
              Protocol Layer
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "monospace", fontSize: 10 }}>
              <span style={{ color: "#94a3b8" }}>Track 8004 Mode</span>
              <span style={{ color: track8004Mode === "reputation-fallback" ? "#fbbf24" : "#22d3ee", fontWeight: 700 }}>
                {track8004Mode || "unknown"}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "monospace", fontSize: 10 }}>
              <span style={{ color: "#94a3b8" }}>Reputation</span>
              <span style={{ color: "#34d399", fontWeight: 700 }}>{reputationScore ?? "--"}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <WalletBtn
                label={loading === "x402-quote" ? "Quote..." : "x402 Quote"}
                onClick={() => handleCreateX402Quote(selectedAgent)}
                disabled={loading !== null}
                color="#22d3ee"
              />
              <WalletBtn
                label={loading === "x402-settle" ? "Settle..." : "x402 Settle"}
                onClick={() => handleSettleX402(selectedAgent)}
                disabled={loading !== null || !x402Quote}
                color="#34d399"
              />
            </div>

            {x402Quote && x402Countdown !== null && (
              <div style={{
                fontFamily: "monospace",
                fontSize: 9,
                color: x402Countdown < 60 ? "#f87171" : "#94a3b8",
                lineHeight: 1.5,
                padding: "4px 6px",
                background: "#111827",
                borderRadius: 3,
                border: `1px solid ${x402Countdown < 60 ? "#f8717122" : "#1e293b"}`,
              }}>
                <div>ref: {truncAddr(x402Quote.paymentRef)}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  <span>usd: {x402Quote.amountUsd.toFixed(3)}</span>
                  <span style={{ color: x402Countdown < 60 ? "#f87171" : "#64748b" }}>
                    expires: {fmtCountdown(x402Countdown)}
                  </span>
                </div>
              </div>
            )}

            {/* Penalty with confirmation */}
            {!penaltyConfirm ? (
              <WalletBtn
                label="Penalty -10"
                onClick={() => setPenaltyConfirm(true)}
                disabled={loading !== null}
                color="#f87171"
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#fbbf24", textAlign: "center" }}>
                  Apply -10 rep to {selectedAgent.name}?
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <WalletBtn
                    label={loading === "rep-penalty" ? "..." : "Confirm"}
                    onClick={async () => {
                      setLoading("rep-penalty")
                      setError(null)
                      setPenaltyConfirm(false)
                      try {
                        await applyReputation(selectedAgent.id, -10, "manual-penalty")
                        toast("Penalty applied: -10 reputation", { icon: "⚠️" })
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "reputation penalty failed")
                      }
                      setLoading(null)
                    }}
                    disabled={loading !== null}
                    color="#f87171"
                  />
                  <WalletBtn
                    label="Cancel"
                    onClick={() => setPenaltyConfirm(false)}
                    disabled={loading !== null}
                    color="#64748b"
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Error display */}
      {error && (
        <div style={{
          fontFamily: "monospace", fontSize: 10, color: "#f87171",
          padding: "6px 10px", background: "#f8717111", borderRadius: 4,
          border: "1px solid #f8717122",
        }}>
          {error}
        </div>
      )}

      {/* Transaction history */}
      {transactions.length > 0 && (
        <div style={{ padding: 10, background: "#0f172a", borderRadius: 6, border: "1px solid #1e293b" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Transactions
          </div>
              <div role="status" aria-live="polite" aria-label="Transaction history content" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...transactions].reverse().slice(0, 10).map(tx => (
              <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontFamily: "monospace" }}>
                <span style={{ color: "#f87171" }}>{tx.fromName}</span>
                <span style={{ color: "#334155" }}>{">"}</span>
                <span style={{ color: "#34d399" }}>{tx.toName}</span>
                <span style={{ color: "#fbbf24", marginLeft: "auto" }}>{tx.amount} XLM</span>
                <span style={{ color: "#334155", fontSize: 9 }}>{tx.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All wallets */}
      <div style={{ padding: 10, background: "#0f172a", borderRadius: 6, border: "1px solid #1e293b" }}>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          All Bot Wallets
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {agents.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
              <span style={{
                fontFamily: "monospace", fontSize: 10, flex: 1,
                color: a.id === selectedAgent.id ? a.color : "#94a3b8",
                fontWeight: a.id === selectedAgent.id ? 700 : 400,
              }}>
                {a.name}
              </span>
              <span suppressHydrationWarning style={{ fontFamily: "monospace", fontSize: 10, color: a.wallet?.funded ? "#fbbf24" : "#334155" }}>
                {a.wallet ? `${parseFloat(a.wallet.balance).toFixed(1)} XLM` : "---"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
