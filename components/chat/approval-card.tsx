"use client"

import { useEffect, useState } from "react"
import { Check, ShieldAlert, X } from "lucide-react"

export type ApprovalState = "pending" | "working" | "approved" | "rejected" | "expired" | "failed"

export type ApprovalCardData = {
  fromName: string
  toName: string
  task: string
  amount: string
  reason: "run" | "day"
  capUsdc: string
  expiresAt: number
  state: ApprovalState
}

/**
 * Asks the person before the orchestrator wallet goes over its spending cap (the ask_person idea
 * from CopilotKit/openbot, MIT, app/src/lib/copilot/escalation-tool.tsx). The decision is sent
 * back with a signed, single-use token; the card itself cannot change what is approved.
 */
export function ApprovalCard({ data, onDecide }: { data: ApprovalCardData; onDecide: (decision: "approve" | "reject") => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (data.state !== "pending") return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [data.state])

  const expired = data.state === "pending" && now >= data.expiresAt
  const state: ApprovalState = expired ? "expired" : data.state
  const secondsLeft = Math.max(0, Math.round((data.expiresAt - now) / 1000))
  const capWords = data.reason === "run" ? "per-conversation" : "daily"
  const disabled = state !== "pending"

  return (
    <section aria-label="Approval needed" style={{ border: "1px solid #a78bfa66", borderRadius: 8, background: "#1e1b4b55", padding: "9px 10px", display: "grid", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace", fontSize: 10, fontWeight: 800, color: "#c4b5fd", textTransform: "uppercase", letterSpacing: 0.8 }}>
        <ShieldAlert size={12} aria-hidden="true" /> Approval needed
      </div>
      <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, lineHeight: 1.5, color: "#e2e8f0" }}>
        {data.fromName} wants to hire {data.toName} for {data.amount} USDC (Solana devnet). This goes over the orchestrator&apos;s {capWords} cap of {data.capUsdc} USDC.
      </p>
      <p style={{ margin: 0, fontFamily: "monospace", fontSize: 10, lineHeight: 1.5, color: "#94a3b8" }}>Task: {data.task}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDecide("approve")}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid #5eead455", borderRadius: 6, background: disabled ? "#111827" : "#14b8a622", color: disabled ? "#475569" : "#5eead4", padding: "6px 10px", fontFamily: "monospace", fontSize: 11, cursor: disabled ? "not-allowed" : "pointer" }}
        >
          <Check size={12} aria-hidden="true" /> Approve
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDecide("reject")}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid #f8717155", borderRadius: 6, background: disabled ? "#111827" : "#ef444422", color: disabled ? "#475569" : "#fca5a5", padding: "6px 10px", fontFamily: "monospace", fontSize: 11, cursor: disabled ? "not-allowed" : "pointer" }}
        >
          <X size={12} aria-hidden="true" /> Reject
        </button>
        <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 9, color: "#64748b" }}>
          {state === "pending" ? `expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : state === "working" ? "sending..." : state === "failed" ? "not sent" : state}
        </span>
      </div>
    </section>
  )
}
