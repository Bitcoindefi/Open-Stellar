"use client"

import { useState, useEffect, useCallback, type ReactNode } from "react"
import { Copy, Download, Share2 } from "lucide-react"
import { toast } from "sonner"
import type { AgentAppearance, MoltbotAgent, LogEntry, ChatMessage, WalletTransaction } from "@/lib/types"
import { DISTRICTS } from "@/lib/data"
import { formatAgentShareText, getAgentOgPath, getAgentProfilePath, slugifyAgent } from "@/lib/og-card-data"
import { ChatPanel } from "./chat-panel"
import { SkillsPanel } from "./skills-panel"
import { WalletPanel } from "./wallet-panel"
import { AppearancePanel } from "./appearance-panel"
import { MOCK_OFFERS, TaskBoard, getTaskOfferCounts } from "./task-board"

type TabId = "overview" | "chat" | "offers" | "skills" | "wallet" | "appearance"

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "chat", label: "Chat" },
  { id: "offers", label: "Offers" },
  { id: "skills", label: "Skills" },
  { id: "wallet", label: "Wallet" },
  { id: "appearance", label: "Appearance" },
]

interface SidebarPanelProps {
  agents: MoltbotAgent[]
  selectedAgent: MoltbotAgent | null
  logs: LogEntry[]
  chatMessages: ChatMessage[]
  transactions: WalletTransaction[]
  onSelectAgent: (id: string | null) => void
  onUpdateAgent: (agentId: string, wallet: MoltbotAgent["wallet"]) => void
  onAddTransaction: (tx: WalletTransaction) => void
  onUpgradeSkill: (agentId: string, skillId: string) => void
  onUpdateAgentAppearance: (agentId: string, appearance: AgentAppearance) => void
  colorBlindMode: boolean
  onColorBlindModeChange: (enabled: boolean) => void
}

function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      background: "#1a2235",
      borderRadius: 6,
      padding: "8px 10px",
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div suppressHydrationWarning style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "monospace" }}>{value}</div>
    </div>
  )
}

function getReputationTier(score: number) {
  if (score >= 1000) return "Platinum"
  if (score >= 500) return "Gold"
  if (score >= 200) return "Silver"
  if (score >= 50) return "Bronze"
  return "Unrated"
}

function tierColor(tier: string) {
  return { Platinum: "#e0e7ff", Gold: "#fbbf24", Silver: "#cbd5e1", Bronze: "#d97706", Unrated: "#64748b" }[tier] ?? "#64748b"
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ background: "#0a0e17", borderRadius: 4, height: 8, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.3s" }} />
    </div>
  )
}

const statusSymbols: Record<string, string> = {
  active: "+",
  working: "*",
  idle: "o",
  error: "x",
  offline: "-",
}

function ShareActionButton({
  label,
  title,
  color,
  icon,
  onClick,
}: {
  label: string
  title: string
  color: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        width: "100%",
        minHeight: 30,
        padding: "6px 8px",
        background: `${color}1a`,
        border: `1px solid ${color}44`,
        borderRadius: 5,
        color,
        cursor: "pointer",
        fontFamily: "monospace",
        fontSize: 9,
        fontWeight: 700,
        lineHeight: 1.1,
        textTransform: "uppercase",
      }}
    >
      {icon}
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  )
}

function AgentShareControls({ agent }: { agent: MoltbotAgent }) {
  const getAbsoluteUrl = (path: string) => {
    if (typeof window === "undefined") return path
    return new URL(path, window.location.origin).toString()
  }

  const profileUrl = getAbsoluteUrl(getAgentProfilePath(agent))
  const imageUrl = getAbsoluteUrl(getAgentOgPath(agent))

  const handleShareX = () => {
    const params = new URLSearchParams({
      text: formatAgentShareText(agent),
      url: profileUrl,
    })
    window.open(`https://twitter.com/intent/tweet?${params.toString()}`, "_blank", "noopener,noreferrer")
  }

  const handleCopyImage = async () => {
    try {
      await navigator.clipboard.writeText(imageUrl)
      toast.success("Image URL copied")
    } catch {
      toast.error("Could not copy image URL")
    }
  }

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl)
      if (!response.ok) throw new Error("image fetch failed")
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = `open-stellar-${slugifyAgent(agent)}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
      toast.success("OG card downloaded")
    } catch {
      toast.error("Could not download OG card")
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
        Share Card
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
        <ShareActionButton
          label="Share on X"
          title="Share this agent profile on X"
          color="#22d3ee"
          icon={<Share2 size={13} aria-hidden="true" />}
          onClick={handleShareX}
        />
        <ShareActionButton
          label="Copy image URL"
          title="Copy this agent OG image URL"
          color="#34d399"
          icon={<Copy size={13} aria-hidden="true" />}
          onClick={handleCopyImage}
        />
        <ShareActionButton
          label="Download PNG"
          title="Download this agent OG image"
          color="#fbbf24"
          icon={<Download size={13} aria-hidden="true" />}
          onClick={handleDownload}
        />
      </div>
    </div>
  )
}

function AgentRow({
  agent,
  isSelected,
  colorBlindMode,
  onClick,
}: {
  agent: MoltbotAgent
  isSelected: boolean
  colorBlindMode?: boolean
  onClick: () => void
}) {
  const statusColors: Record<string, string> = {
    active: "#34d399", working: "#fbbf24", idle: "#64748b", error: "#f87171", offline: "#1e293b",
  }
  return (
    <button
      onClick={onClick}
      role="option"
      aria-selected={isSelected}
      aria-label={`${agent.name}, ${agent.status}, CPU ${agent.cpu} percent, ${agent.currentTask || "no active task"}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "6px 8px",
        background: isSelected ? "#1e293b" : "transparent",
        border: isSelected ? "1px solid #2a3a52" : "1px solid transparent",
        borderRadius: 6,
        cursor: "pointer",
        color: "#e2e8f0",
        textAlign: "left",
        transition: "background 0.15s",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: colorBlindMode ? 14 : 8,
          height: colorBlindMode ? 14 : 8,
          borderRadius: colorBlindMode ? 3 : "50%",
          background: statusColors[agent.status],
          color: "#020617",
          flexShrink: 0,
          fontSize: 10,
          lineHeight: "14px",
          textAlign: "center",
          fontFamily: "monospace",
          fontWeight: 700,
        }}
      >
        {colorBlindMode ? statusSymbols[agent.status] ?? "•" : ""}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "monospace", color: agent.color }}>{agent.name}</div>
        <div style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {agent.currentTask || agent.status}
        </div>
      </div>
      <div suppressHydrationWarning style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>{agent.cpu}%</div>
    </button>
  )
}

function OverviewTab({
  agents,
  selectedAgent,
  logs,
  onSelectAgent,
  colorBlindMode,
  onColorBlindModeChange,
}: {
  agents: MoltbotAgent[]
  selectedAgent: MoltbotAgent | null
  logs: LogEntry[]
  onSelectAgent: (id: string | null) => void
  colorBlindMode: boolean
  onColorBlindModeChange: (enabled: boolean) => void
}) {
  const [logExpanded, setLogExpanded] = useState(false)

  const active = agents.filter(a => a.status === "active" || a.status === "working").length
  const working = agents.filter(a => a.status === "working").length
  const errors = agents.filter(a => a.status === "error").length
  const totalTasks = agents.reduce((s, a) => s + a.tasksCompleted, 0)
  const offerCounts = selectedAgent ? getTaskOfferCounts(selectedAgent.id, MOCK_OFFERS) : null
  const [reputation, setReputation] = useState<{ score: number; tier: string } | null>(null)
  const [attestation, setAttestation] = useState<{ hash: string; stellarExpertUrl: string } | null>(null)
  const [mintingAttestation, setMintingAttestation] = useState(false)
  const selectedAgentId = selectedAgent?.id ?? null

  useEffect(() => {
    if (!selectedAgentId) {
      setReputation(null)
      setAttestation(null)
      return
    }

    let cancelled = false
    fetch(`/api/protocol/reputation?actorId=${encodeURIComponent(selectedAgentId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const score = typeof data?.reputation?.score === "number" ? data.reputation.score : 0
        setReputation({ score, tier: String(data?.reputation?.tier || getReputationTier(score)) })
      })
      .catch(() => {
        if (!cancelled) setReputation(null)
      })
    return () => { cancelled = true }
  }, [selectedAgentId])

  const mintReputationAttestation = useCallback(async () => {
    if (!selectedAgentId) return
    setMintingAttestation(true)
    try {
      const res = await fetch('/api/protocol/reputation/attestation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: selectedAgentId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Mint failed')
      setReputation({ score: data.reputation.score, tier: data.reputation.tier })
      setAttestation(data.attestation)
      toast.success('Reputation attestation minted', { description: data.attestation.hash.slice(0, 18) + '…' })
    } catch (error) {
      toast.error('Attestation mint failed', { description: error instanceof Error ? error.message : 'Unknown error' })
    }
    setMintingAttestation(false)
  }, [selectedAgentId])

  const logTypeColors: Record<string, string> = {
    info: "#60a5fa", success: "#34d399", error: "#f87171", warning: "#fbbf24",
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Stats */}
      <div style={{ padding: 12, borderBottom: "1px solid #2a3a52" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
            City Overview
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>
            <input
              type="checkbox"
              checked={colorBlindMode}
              onChange={(event) => onColorBlindModeChange(event.target.checked)}
              aria-label="Toggle color-blind mode"
            />
            Shapes
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <StatBox label="Active" value={active} color="#34d399" />
          <StatBox label="Working" value={working} color="#fbbf24" />
          <StatBox label="Errors" value={errors} color="#f87171" />
          <StatBox label="Tasks Done" value={totalTasks} color="#22d3ee" />
        </div>
      </div>

      {/* Selected agent detail */}
      {selectedAgent && (
        <div style={{ padding: 12, borderBottom: "1px solid #2a3a52", background: "#0f172a" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: selectedAgent.color, fontFamily: "monospace" }}>
                {selectedAgent.name}
              </span>
              <span style={{ fontFamily: "monospace", fontSize: 9, fontWeight: 800, color: tierColor(reputation?.tier || "Unrated"), border: `1px solid ${tierColor(reputation?.tier || "Unrated")}55`, borderRadius: 999, padding: "2px 6px", textTransform: "uppercase" }}>
                {reputation?.tier || "unrated"}
              </span>
            </div>
            <button
              onClick={() => onSelectAgent(null)}
              style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14 }}
              aria-label="Close agent detail"
            >
              x
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
            Model: {selectedAgent.model}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
            District: {DISTRICTS.find(d => d.id === selectedAgent.district)?.name}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
            {"Status: "}
            <span style={{ color: selectedAgent.status === "error" ? "#f87171" : "#34d399", fontWeight: 600 }}>
              {selectedAgent.status.toUpperCase()}
            </span>
          </div>

          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>{"CPU " + selectedAgent.cpu + "%"}</div>
          <ProgressBar value={selectedAgent.cpu} color="#22d3ee" />
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4, marginTop: 6 }}>{"Memory " + selectedAgent.memory + "%"}</div>
          <ProgressBar value={selectedAgent.memory} color="#a78bfa" />

          {selectedAgent.currentTask && (
            <>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4, marginTop: 6 }}>
                {"Task: " + selectedAgent.currentTask}
              </div>
              <ProgressBar value={selectedAgent.taskProgress} color={selectedAgent.color} />
            </>
          )}

          <div suppressHydrationWarning style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
            {"Completed: " + selectedAgent.tasksCompleted + " tasks"}
          </div>

          <div style={{ marginTop: 8, padding: 8, border: "1px solid #1e293b", borderRadius: 6, background: "#111827" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>
              <span>Reputation</span>
              <span style={{ color: tierColor(reputation?.tier || "Unrated"), fontWeight: 700 }}>{reputation?.score ?? "--"}/1300</span>
            </div>
            <ProgressBar value={Math.min(100, ((reputation?.score ?? 0) / 1300) * 100)} color={tierColor(reputation?.tier || "Unrated")} />
            <button
              onClick={mintReputationAttestation}
              disabled={mintingAttestation}
              style={{ width: "100%", marginTop: 8, padding: "6px 8px", background: "#22d3ee22", color: "#67e8f9", border: "1px solid #22d3ee44", borderRadius: 4, cursor: mintingAttestation ? "wait" : "pointer", fontFamily: "monospace", fontSize: 10, fontWeight: 700 }}
            >
              {mintingAttestation ? "Minting..." : "Mint reputation attestation"}
            </button>
            {attestation && (
              <a href={attestation.stellarExpertUrl} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 6, color: "#38bdf8", fontFamily: "monospace", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {attestation.hash}
              </a>
            )}
          </div>
          {offerCounts && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <StatBox label="Posted" value={offerCounts.posted} color="#67e8f9" />
              <StatBox label="Filled" value={offerCounts.filled} color="#34d399" />
            </div>
          )}

          <AgentShareControls agent={selectedAgent} />
        </div>
      )}

      {/* Agent list */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 8px" }}>
        <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, padding: "0 4px" }}>
          {"Agents (" + agents.length + ")"}
        </div>
        <div role="listbox" aria-label="Agents" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {agents.map(a => (
            <AgentRow
              key={a.id}
              agent={a}
              isSelected={selectedAgent?.id === a.id}
              colorBlindMode={colorBlindMode}
              onClick={() => onSelectAgent(a.id)}
            />
          ))}
        </div>
      </div>

      {/* Activity log — expandable */}
      <div style={{
        height: logExpanded ? 280 : 140,
        borderTop: "1px solid #2a3a52",
        overflow: "auto",
        padding: 8,
        transition: "height 0.2s ease",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
            Activity Log
          </div>
          <button
            onClick={() => setLogExpanded(e => !e)}
            style={{
              background: "none",
              border: "none",
              color: "#475569",
              cursor: "pointer",
              fontSize: 10,
              fontFamily: "monospace",
              padding: "2px 4px",
              transition: "color 0.15s",
            }}
            title={logExpanded ? "Collapse log" : "Expand log"}
          >
            {logExpanded ? "▼" : "▲"}
          </button>
        </div>
        {logs.slice(-40).reverse().map(log => (
          <div key={log.id} style={{ fontSize: 10, marginBottom: 3, display: "flex", gap: 6, lineHeight: 1.4 }}>
            <span style={{ color: "#475569", flexShrink: 0, fontFamily: "monospace" }}>{log.time}</span>
            <span style={{ color: logTypeColors[log.type] || "#94a3b8" }}>
              <strong>{log.agent}</strong> {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SidebarPanel({
  agents,
  selectedAgent,
  logs,
  chatMessages,
  transactions,
  onSelectAgent,
  onUpdateAgent,
  onAddTransaction,
  onUpgradeSkill,
  onUpdateAgentAppearance,
  colorBlindMode,
  onColorBlindModeChange,
}: SidebarPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("sidebar-tab") as TabId) || "overview"
    }
    return "overview"
  })

  useEffect(() => {
    localStorage.setItem("sidebar-tab", activeTab)
  }, [activeTab])

  const chatCount = chatMessages.length
  const errorCount = agents.filter(a => a.status === "error").length
  const walletAlert = agents.some(a => !a.wallet || (a.wallet.funded && parseFloat(a.wallet.balance) < 10))
  const openOfferCount = MOCK_OFFERS.filter(offer => offer.status === "open").length

  return (
    <div style={{
      width: 320,
      height: "100%",
      background: "#111827",
      borderLeft: "1px solid #2a3a52",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      flexShrink: 0,
    }}>
      {/* Tab bar */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid #2a3a52",
        background: "#0f172a",
        flexShrink: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: "10px 4px",
              background: activeTab === tab.id ? "#111827" : "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #22d3ee" : "2px solid transparent",
              color: activeTab === tab.id ? "#22d3ee" : "#64748b",
              fontFamily: "monospace",
              fontSize: 10,
              fontWeight: activeTab === tab.id ? 700 : 400,
              cursor: "pointer",
              transition: "all 0.15s",
              position: "relative",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {tab.label}
            {/* Status badges */}
            {tab.id === "chat" && chatCount > 0 && (
              <span style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#34d399",
              }} />
            )}
            {tab.id === "offers" && openOfferCount > 0 && (
              <span style={{
                position: "absolute",
                top: 3,
                right: 2,
                minWidth: 14,
                height: 14,
                borderRadius: 7,
                background: "#22d3ee",
                color: "#020617",
                fontSize: 8,
                fontFamily: "monospace",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 2px",
              }}>
                {openOfferCount}
              </span>
            )}
            {tab.id === "overview" && errorCount > 0 && (
              <span style={{
                position: "absolute",
                top: 3,
                right: 2,
                minWidth: 14,
                height: 14,
                borderRadius: 7,
                background: "#f87171",
                color: "#fff",
                fontSize: 8,
                fontFamily: "monospace",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 2px",
              }}>
                {errorCount}
              </span>
            )}
            {tab.id === "wallet" && walletAlert && (
              <span style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#fbbf24",
              }} />
            )}
          </button>
        ))}
        <a
          href="/admin"
          style={{
            padding: "10px 8px",
            background: "transparent",
            borderBottom: "2px solid transparent",
            color: "#22d3ee",
            fontFamily: "monospace",
            fontSize: 10,
            fontWeight: 400,
            cursor: "pointer",
            textDecoration: "none",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            display: "flex",
            alignItems: "center",
            whiteSpace: "nowrap",
            transition: "color 0.15s",
            flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#67e8f9")}
          onMouseLeave={e => (e.currentTarget.style.color = "#22d3ee")}
        >
          Admin ↗
        </a>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeTab === "overview" && (
          <OverviewTab
            agents={agents}
            selectedAgent={selectedAgent}
            logs={logs}
            onSelectAgent={onSelectAgent}
            colorBlindMode={colorBlindMode}
            onColorBlindModeChange={onColorBlindModeChange}
          />
        )}
        {activeTab === "chat" && (
          <ChatPanel messages={chatMessages} />
        )}
        {activeTab === "offers" && (
          <TaskBoard agents={agents} selectedAgent={selectedAgent} />
        )}
        {activeTab === "skills" && (
          <SkillsPanel selectedAgent={selectedAgent} agents={agents} onUpgradeSkill={onUpgradeSkill} />
        )}
        {activeTab === "wallet" && (
          <WalletPanel
            agents={agents}
            selectedAgent={selectedAgent}
            transactions={transactions}
            onUpdateAgent={onUpdateAgent}
            onAddTransaction={onAddTransaction}
          />
        )}
        {activeTab === "appearance" && (
          <AppearancePanel
            agents={agents}
            selectedAgent={selectedAgent}
            onUpdateAgentAppearance={onUpdateAgentAppearance}
          />
        )}
      </div>
    </div>
  )
}
