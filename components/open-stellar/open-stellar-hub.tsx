"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { PixelCity, type TxAnimation } from "@/components/pixel-city"
import { SidebarPanel } from "@/components/sidebar-panel"
import { PriceTicker } from "@/components/price-display"
import { DISTRICTS, createAgents, generateChatMessage, getRandomTask } from "@/lib/data"
import type { ChatMessage, LogEntry, MoltbotAgent, WalletTransaction } from "@/lib/types"

function nowTime() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

const ONBOARDING_STEPS = [
  {
    title: "Agent City",
    body: "The canvas shows your AI agents roaming a pixel city. Click any bot on the map to inspect it.",
    hint: "← try clicking a bot",
  },
  {
    title: "Sidebar Controls",
    body: "The sidebar has four tabs: Overview (stats + log), Chat (bot comms), Skills, and Wallet (Stellar payments).",
    hint: "→ explore the tabs",
  },
  {
    title: "Admin Console",
    body: "Visit /admin to manage ZK passports, x402 payment rails, subscription plans, and API keys.",
    hint: "↗ click Admin in the sidebar",
  },
]

function OnboardingModal({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const current = ONBOARDING_STEPS[step]
  const isLast = step === ONBOARDING_STEPS.length - 1

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 100,
      background: "rgba(3,7,18,0.88)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{
        background: "#111827",
        border: "1px solid #2a3a52",
        borderRadius: 16,
        padding: 32,
        maxWidth: 380,
        width: "90%",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
      }}>
        {/* Step dots */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 24 }}>
          {ONBOARDING_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: i === step ? "#22d3ee" : "#2a3a52",
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>

        <div style={{
          fontFamily: "monospace",
          fontSize: 9,
          color: "#22d3ee",
          textTransform: "uppercase",
          letterSpacing: 2,
          marginBottom: 12,
        }}>
          {`Step ${step + 1} of ${ONBOARDING_STEPS.length}`}
        </div>

        <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 12 }}>
          {current.title}
        </div>

        <div style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 16 }}>
          {current.body}
        </div>

        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#475569", marginBottom: 28 }}>
          {current.hint}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{
                flex: 1,
                padding: "8px 16px",
                background: "transparent",
                border: "1px solid #2a3a52",
                borderRadius: 6,
                color: "#64748b",
                fontFamily: "monospace",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Back
            </button>
          )}
          <button
            onClick={() => { if (isLast) { onDone() } else { setStep(s => s + 1) } }}
            style={{
              flex: 2,
              padding: "8px 16px",
              background: "#22d3ee22",
              border: "1px solid #22d3ee44",
              borderRadius: 6,
              color: "#22d3ee",
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            {isLast ? "Get started" : "Next"}
          </button>
        </div>

        <button
          onClick={onDone}
          style={{
            display: "block",
            width: "100%",
            marginTop: 12,
            background: "none",
            border: "none",
            color: "#334155",
            fontFamily: "monospace",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          skip
        </button>
      </div>
    </div>
  )
}

export function OpenStellarHub() {
  const [agents, setAgents] = useState<MoltbotAgent[]>(() => createAgents())
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [tick, setTick] = useState(0)
  const [txAnimations, setTxAnimations] = useState<TxAnimation[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [colorBlindMode, setColorBlindMode] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)

  // Show onboarding once on first visit
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const storedColorBlind = localStorage.getItem("colorblind-mode")
    const queryColorBlind = params.get("colorblind")
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

    setColorBlindMode(queryColorBlind === "true" || storedColorBlind === "true")
    setReduceMotion(prefersReducedMotion.matches)

    const handleMotionChange = (event: MediaQueryListEvent) => {
      setReduceMotion(event.matches)
    }

    prefersReducedMotion.addEventListener("change", handleMotionChange)

    if (!localStorage.getItem("onboarding-seen")) {
      setShowOnboarding(true)
    }
    // Collapse sidebar by default on small screens
    if (window.innerWidth < 768) {
      setSidebarOpen(false)
    }

    return () => {
      prefersReducedMotion.removeEventListener("change", handleMotionChange)
    }
  }, [])

  const handleColorBlindModeChange = useCallback((enabled: boolean) => {
    setColorBlindMode(enabled)
    localStorage.setItem("colorblind-mode", String(enabled))
  }, [])

  const handleDoneOnboarding = useCallback(() => {
    setShowOnboarding(false)
    localStorage.setItem("onboarding-seen", "1")
  }, [])

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) || null,
    [agents, selectedAgentId]
  )

  const pushLog = useCallback((message: string, type: LogEntry["type"] = "info", agent = "system") => {
    setLogs((prev) => [
      ...prev.slice(-79),
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        time: nowTime(),
        agent,
        message,
        type,
      },
    ])
  }, [])

  const agentsRef = useRef(agents)
  useEffect(() => { agentsRef.current = agents }, [agents])

  useEffect(() => {
    pushLog("Open-Stellar v0 frontend initialized", "success")
  }, [pushLog])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((prev) => prev + 1)

      setAgents((prev) =>
        prev.map((agent) => {
          const progressDelta = Math.random() * 14
          const taskProgress = Math.min(100, agent.taskProgress + progressDelta)
          const finishedTask = taskProgress >= 100

          return {
            ...agent,
            cpu: Math.max(10, Math.min(98, agent.cpu + (Math.random() - 0.5) * 10)),
            memory: Math.max(20, Math.min(95, agent.memory + (Math.random() - 0.5) * 6)),
            status: finishedTask
              ? "active"
              : Math.random() < 0.04
              ? "idle"
              : "working",
            taskProgress: finishedTask ? 0 : taskProgress,
            tasksCompleted: finishedTask ? agent.tasksCompleted + 1 : agent.tasksCompleted,
            currentTask: finishedTask ? getRandomTask(agent.district) : agent.currentTask,
            targetX: agent.targetX + (Math.random() - 0.5) * 40,
            targetY: agent.targetY + (Math.random() - 0.5) * 28,
            pixelX: agent.pixelX + (Math.random() - 0.5) * 4,
            pixelY: agent.pixelY + (Math.random() - 0.5) * 3,
            direction: Math.random() > 0.5 ? "right" : "left",
          }
        })
      )
    }, 1200)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const chatInterval = window.setInterval(() => {
      setChatMessages((prev) => {
        const next = generateChatMessage(agentsRef.current)
        if (!next) return prev

        if (Math.random() < 0.5) {
          pushLog(`relay ${next.fromName} -> ${next.toName}: ${next.message}`, "info", next.fromName)
        }

        return [...prev.slice(-79), next]
      })
    }, 2200)

    return () => window.clearInterval(chatInterval)
  }, [pushLog])

  // Prune finished tx animations
  useEffect(() => {
    if (txAnimations.length === 0) return
    const id = window.setInterval(() => {
      const now = Date.now()
      setTxAnimations(prev => prev.filter(a => now - a.startedAt < a.duration))
    }, 500)
    return () => window.clearInterval(id)
  }, [txAnimations.length])

  const handleSelectAgent = useCallback((id: string | null) => {
    setSelectedAgentId(id)

    const picked = agentsRef.current.find((agent) => agent.id === id)
    if (picked) {
      pushLog(`agent selected: ${picked.name} (${picked.model})`, "info", picked.name)
    }
  }, [pushLog])

  const handleUpdateAgentWallet = useCallback((agentId: string, wallet: MoltbotAgent["wallet"]) => {
    setAgents((prev) => {
      const updated = prev.map((agent) => (agent.id === agentId ? { ...agent, wallet } : agent))
      const updatedAgent = updated.find((agent) => agent.id === agentId)
      if (updatedAgent && wallet?.publicKey) {
        pushLog(`wallet linked: ${updatedAgent.name} -> ${wallet.publicKey.slice(0, 8)}...`, "success", updatedAgent.name)
      }
      return updated
    })
  }, [pushLog])

  const handleAddTransaction = useCallback((tx: WalletTransaction) => {
    setTransactions((prev) => [tx, ...prev.slice(0, 99)])
    pushLog(`tx ${tx.fromName} -> ${tx.toName} (${tx.amount} XLM)`, "success", tx.fromName)

    // Spawn a tx animation between the two agents
    const current = agentsRef.current
    const fromAgent = current.find(a => a.name === tx.fromName)
    const toAgent = current.find(a => a.name === tx.toName)
    if (fromAgent && toAgent) {
      setTxAnimations(prev => [
        ...prev,
        {
          id: tx.id,
          fromX: fromAgent.pixelX + 8,
          fromY: fromAgent.pixelY + 10,
          toX: toAgent.pixelX + 8,
          toY: toAgent.pixelY + 10,
          startedAt: Date.now(),
          duration: 1800,
        },
      ])
    }
  }, [pushLog])

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", overflow: "hidden", background: "#030712", position: "relative" }}>
      {showOnboarding && <OnboardingModal onDone={handleDoneOnboarding} />}

      {/* Canvas area */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <PixelCity
          agents={agents}
          districts={DISTRICTS}
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
          tick={tick}
          txAnimations={txAnimations}
          colorBlindMode={colorBlindMode}
          reduceMotion={reduceMotion}
        />

        {/* Sidebar toggle button */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          style={{
            position: "absolute",
            top: "50%",
            right: 0,
            transform: "translateY(-50%)",
            zIndex: 5,
            background: "#111827",
            border: "1px solid #2a3a52",
            borderRight: "none",
            borderRadius: "6px 0 0 6px",
            color: "#22d3ee",
            fontFamily: "monospace",
            fontSize: 14,
            padding: "10px 6px",
            cursor: "pointer",
            lineHeight: 1,
            transition: "background 0.15s",
          }}
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          {sidebarOpen ? "›" : "‹"}
        </button>
      </div>

      {/* Sidebar — conditionally rendered */}
      {sidebarOpen && (
        <SidebarPanel
          agents={agents}
          selectedAgent={selectedAgent}
          logs={logs}
          chatMessages={chatMessages}
          transactions={transactions}
          onSelectAgent={handleSelectAgent}
          onUpdateAgent={handleUpdateAgentWallet}
          onAddTransaction={handleAddTransaction}
          colorBlindMode={colorBlindMode}
          onColorBlindModeChange={handleColorBlindModeChange}
        />
      )}
    </div>
  )
}

