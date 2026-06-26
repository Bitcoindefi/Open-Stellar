"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { PixelCity, type FloatingOverlay, type ParticleTrigger, type TxAnimation } from "@/components/pixel-city"
import { SidebarPanel } from "@/components/sidebar-panel"
import { PriceTicker } from "@/components/price-display"
import { AudioControls } from "@/components/audio-controls"
import { DistrictEventOverlay } from "@/components/open-stellar/district-event-overlay"
import { CityAudioEngine } from "@/lib/audio/city-audio"
import { DISTRICTS, createAgents, generateChatMessage, getRandomTask } from "@/lib/data"
import { LEGAL_LINKS } from "@/lib/legal-links"
import type { PublishedSystemEvent } from "@/lib/events/system-events"
import { getActiveDistrictEvent, getDistrictStandings } from "@/lib/gamification/events"
import { upgradeAgentSkill } from "@/lib/gamification/skill-upgrades"
import type { AgentAppearance, ChatMessage, LogEntry, MoltbotAgent, WalletTransaction } from "@/lib/types"

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

interface AgentHealthApiSnapshot {
  agentId: string
  status: "healthy" | "stale" | "offline"
  runtimeStatus: "active" | "idle" | "working" | "error" | "offline"
  lastHeartbeat: string
  offlineForSeconds: number
  cpu: number | null
  memory: number | null
  currentTask: string | null
}

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

        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 16,
          borderTop: "1px solid #1f2a44",
          paddingTop: 14,
        }}>
          {LEGAL_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              style={{
                color: "#64748b",
                fontFamily: "monospace",
                fontSize: 10,
                textDecoration: "none",
              }}
            >
              {link.shortLabel}
            </a>
          ))}
        </div>
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
  const [floatingOverlays, setFloatingOverlays] = useState<FloatingOverlay[]>([])
  const [particleTriggers, setParticleTriggers] = useState<ParticleTrigger[]>([])
  const agentLevelsRef = useRef<Map<string, number>>(new Map())
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [colorBlindMode, setColorBlindMode] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)
  const [eventStreamConnected, setEventStreamConnected] = useState(false)
  const [hasRealtimeEvents, setHasRealtimeEvents] = useState(false)
  const fallbackLoggedRef = useRef(false)
  const [audioEngine] = useState(() => new CityAudioEngine())
  const [activeDistrictEvent, setActiveDistrictEvent] = useState(() => getActiveDistrictEvent())
  const lastLeadingDistrictRef = useRef<string | null>(null)

  useEffect(() => {
    return () => audioEngine.dispose()
  }, [audioEngine])

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

  const animateAgentToDistrict = useCallback((agent: MoltbotAgent) => {
    const district = DISTRICTS.find((candidate) => candidate.id === agent.district)
    if (!district) return

    setTxAnimations((prev) => [
      ...prev,
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        fromX: agent.pixelX + 8,
        fromY: agent.pixelY + 10,
        toX: district.x + district.w / 2,
        toY: district.y + district.h / 2,
        startedAt: Date.now(),
        duration: 1600,
      },
    ])
  }, [])

  const showAgentOverlay = useCallback((agent: MoltbotAgent, text: string, color = "#fbbf24") => {
    setFloatingOverlays((prev) => [
      ...prev,
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        x: agent.pixelX + 8,
        y: agent.pixelY,
        text,
        color,
        startedAt: Date.now(),
        duration: 2200,
      },
    ])
  }, [])

  const spawnParticles = useCallback(
    (type: ParticleTrigger["type"], x: number, y: number, opts?: ParticleTrigger["opts"]) => {
      setParticleTriggers((prev) => [
        ...prev,
        {
          id: Date.now() + Math.floor(Math.random() * 1000),
          type,
          x,
          y,
          opts,
        },
      ])
    },
    []
  )


  const districtStandings = useMemo(
    () => getDistrictStandings(agents),
    [agents]
  )

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveDistrictEvent(getActiveDistrictEvent())
    }, 60_000)

    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const leader = districtStandings[0]
    if (!leader) return
    const previousLeader = lastLeadingDistrictRef.current
    lastLeadingDistrictRef.current = leader.districtId
    if (!previousLeader || previousLeader === leader.districtId) return

    const district = DISTRICTS.find((candidate) => candidate.id === leader.districtId)
    if (!district) return
    pushLog(`${leader.districtName} takes the lead in ${activeDistrictEvent.challenge.name}`, "success")
    spawnParticles("district-win", district.x + district.w / 2, district.y, {
      color: district.color,
      spreadW: district.w * 0.7,
    })
  }, [activeDistrictEvent.challenge.name, districtStandings, pushLog, spawnParticles])

  const applySystemEvent = useCallback((event: PublishedSystemEvent) => {
    const animatedAgentBox: { current: MoltbotAgent | null } = { current: null }

    setAgents((prev) =>
      prev.map((agent) => {
        if (agent.id !== event.agentId) return agent

        if (event.type === "agent.status") {
          return { ...agent, status: event.status }
        }

        if (event.type === "task.started") {
          return {
            ...agent,
            status: "working",
            currentTask: event.task.title,
            taskProgress: 0,
          }
        }

        if (event.type === "task.completed") {
          animatedAgentBox.current = agent
          return {
            ...agent,
            status: "active",
            currentTask: event.result.summary || getRandomTask(agent.district),
            taskProgress: 0,
            tasksCompleted: agent.tasksCompleted + 1,
          }
        }

        if (event.type === "payment.received") {
          animatedAgentBox.current = agent
          return {
            ...agent,
            status: "active",
          }
        }

        return agent
      })
    )

    if (event.type === "task.completed") {
      audioEngine.playEvent("task_complete")
      pushLog(`task completed: ${event.taskId} — ${event.result.summary}`, "success", event.agentId)
      const agent = animatedAgentBox.current
      if (agent) {
        animateAgentToDistrict(agent)
        showAgentOverlay(agent, "+task", "#34d399")
        const district = DISTRICTS.find((candidate) => candidate.id === agent.district)
        spawnParticles("xp-burst", agent.pixelX + 8, agent.pixelY, {
          color: district?.color ?? agent.color,
        })
      }
      return
    }

    if (event.type === "payment.received") {
      audioEngine.playEvent("payment_received")
      pushLog(`payment received on ${event.receipt.chain}: ${event.receipt.txHash.slice(0, 12)}...`, "success", event.agentId)
      const amount = event.receipt.amountUsd ? `$${event.receipt.amountUsd.toFixed(3)}` : event.receipt.chain
      toast.success("Payment received", { description: `${event.agentId} settled ${amount}` })
      const agent = animatedAgentBox.current
      if (agent) {
        animateAgentToDistrict(agent)
        showAgentOverlay(agent, `+${amount}`, "#fbbf24")
        const xlmAmount = event.receipt.amountUnits ? `+${event.receipt.amountUnits} XLM` : "+0.01 XLM"
        spawnParticles("payment-spark", agent.pixelX + 8, agent.pixelY + 10, {
          amount: xlmAmount,
        })
      }
      return
    }

    if (event.type === "agent.xp") {
      audioEngine.playEvent("level_up")
      pushLog(`XP update: +${event.xp}, level ${event.level}`, "success", event.agentId)
      const agent = agentsRef.current.find((candidate) => candidate.id === event.agentId)
      if (agent) {
        showAgentOverlay(agent, `+${event.xp} XP`, "#22d3ee")
        const previousLevel = agentLevelsRef.current.get(event.agentId) ?? event.level
        if (event.level > previousLevel) {
          spawnParticles("level-up", agent.pixelX + 8, agent.pixelY, {
            color: agent.color,
            level: event.level,
          })
        }
        agentLevelsRef.current.set(event.agentId, event.level)
      }
      return
    }

    if (event.type === "badge.unlocked") {
      audioEngine.playEvent("badge_unlock")
      pushLog(`badge unlocked: ${event.badge.name}`, "success", event.agentId)
      toast.success("Badge unlocked", { description: `${event.agentId}: ${event.badge.name}` })
      const agent = agentsRef.current.find((candidate) => candidate.id === event.agentId)
      if (agent) {
        showAgentOverlay(agent, event.badge.name, "#a78bfa")
        spawnParticles("badge-unlock", agent.pixelX + 8, agent.pixelY, {
          rarity: event.badge.rarity ?? "common",
        })
      }
      return
    }

    if (event.type === "district.unlocked") {
      audioEngine.playEvent("district_win")
      const districtId = event.districtId ?? event.district?.id
      const district = DISTRICTS.find((candidate) => candidate.id === districtId)
      const districtName = event.district?.name ?? district?.name ?? districtId ?? "a district"
      pushLog(`district unlocked: ${districtName}`, "success", event.agentId ?? "system")
      toast.success("District unlocked", { description: String(districtName) })
      if (district) {
        spawnParticles("district-win", district.x + district.w / 2, district.y, {
          color: district.color,
          spreadW: district.w * 0.7,
        })
      }
      return
    }

    if (event.type === "agent.registry") {
      pushLog(`registry ${event.action}: ${event.agent.agentId}`, "info", event.agentId)
      return
    }

    if (event.type === "task.started") {
      pushLog(`task started: ${event.task.title}`, "info", event.agentId)
      return
    }

    if (event.type === "agent.status") {
      if (event.status === "error") audioEngine.playEvent("agent_error")
      pushLog(`status changed: ${event.status}`, "info", event.agentId)
      return
    }
  }, [animateAgentToDistrict, audioEngine, pushLog, showAgentOverlay, spawnParticles])

  useEffect(() => {
    const eventSource = new EventSource("/api/events")
    const eventTypes = [
      "agent.status",
      "task.started",
      "task.completed",
      "payment.received",
      "agent.xp",
      "badge.unlocked",
      "district.unlocked",
    ]

    const handleEvent = (message: MessageEvent) => {
      try {
        setHasRealtimeEvents(true)
        applySystemEvent(JSON.parse(String(message.data)) as PublishedSystemEvent)
      } catch {
        pushLog("received malformed real-time event", "warning")
      }
    }

    eventSource.onopen = () => {
      setEventStreamConnected(true)
      fallbackLoggedRef.current = false
      pushLog("real-time event stream connected", "success")
    }

    eventSource.onerror = () => {
      setEventStreamConnected(false)
      setHasRealtimeEvents(false)
      if (!fallbackLoggedRef.current) {
        pushLog("event stream unavailable; using local simulation fallback", "warning")
        fallbackLoggedRef.current = true
      }
      eventSource.close()
    }

    for (const eventType of eventTypes) {
      eventSource.addEventListener(eventType, handleEvent as EventListener)
    }

    return () => {
      for (const eventType of eventTypes) {
        eventSource.removeEventListener(eventType, handleEvent as EventListener)
      }
      eventSource.close()
    }
  }, [applySystemEvent, pushLog])

  useEffect(() => {
    let stopped = false

    const sendHeartbeats = async () => {
      const snapshot = agentsRef.current
      await Promise.allSettled(
        snapshot.map((agent) =>
          fetch(`/api/agents/${encodeURIComponent(agent.id)}/heartbeat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: agent.status,
              cpu: agent.cpu,
              memory: agent.memory,
              currentTask: agent.currentTask,
              autoRestart: agent.autoRestart ?? false,
            }),
          }),
        ),
      )
    }

    const syncHealth = async () => {
      const snapshot = agentsRef.current
      const settled = await Promise.allSettled(
        snapshot.map(async (agent) => {
          const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/health`, { cache: "no-store" })
          if (!res.ok) return null
          const data = await res.json()
          return data.health as AgentHealthApiSnapshot
        }),
      )

      if (stopped) return

      const healthById = new Map<string, AgentHealthApiSnapshot>()

      for (const item of settled) {
        if (item.status === "fulfilled" && item.value) {
          healthById.set(item.value.agentId, item.value)
        }
      }

      if (healthById.size === 0) return

      setAgents((prev) =>
        prev.map((agent) => {
          const health = healthById.get(agent.id)
          if (!health) return agent
          return {
            ...agent,
            status: health.status === "offline" ? "offline" : health.runtimeStatus,
            cpu: health.cpu ?? agent.cpu,
            memory: health.memory ?? agent.memory,
            currentTask: health.currentTask ?? agent.currentTask,
            lastHeartbeat: health.lastHeartbeat,
            offlineForSeconds: health.offlineForSeconds,
          }
        }),
      )
    }

    sendHeartbeats()
    syncHealth()
    const heartbeatId = window.setInterval(sendHeartbeats, 15_000)
    const healthId = window.setInterval(syncHealth, 30_000)

    return () => {
      stopped = true
      window.clearInterval(heartbeatId)
      window.clearInterval(healthId)
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((prev) => prev + 1)
    }, 1200)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (eventStreamConnected && hasRealtimeEvents) return

    const interval = window.setInterval(() => {
      setAgents((prev) =>
        prev.map((agent) => {
          if (agent.status === "offline") {
            return {
              ...agent,
              cpu: 0,
              memory: Math.max(0, agent.memory - 1),
              taskProgress: 0,
            }
          }

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
  }, [eventStreamConnected, hasRealtimeEvents])

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

  useEffect(() => {
    if (floatingOverlays.length === 0) return
    const id = window.setInterval(() => {
      const now = Date.now()
      setFloatingOverlays(prev => prev.filter(overlay => now - overlay.startedAt < overlay.duration))
    }, 500)
    return () => window.clearInterval(id)
  }, [floatingOverlays.length])

  // Particle triggers are one-shot — PixelCity consumes them into its ParticleSystem on
  // receipt, so this just garbage-collects the request objects shortly after.
  useEffect(() => {
    if (particleTriggers.length === 0) return
    const id = window.setTimeout(() => {
      setParticleTriggers([])
    }, 500)
    return () => window.clearTimeout(id)
  }, [particleTriggers])

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

  const handleUpgradeSkill = useCallback((agentId: string, skillId: string) => {
    const currentAgent = agentsRef.current.find((agent) => agent.id === agentId)
    if (!currentAgent) {
      pushLog("skill upgrade blocked: agent not found", "warning", agentId)
      return
    }

    const preview = upgradeAgentSkill(currentAgent, skillId)
    if (!preview.result) {
      pushLog("skill upgrade blocked: skill not found", "warning", currentAgent.name)
      return
    }

    if (!preview.result.upgraded) {
      const blockedReason = preview.result.reason === "max-level" ? "already at max level" : "not enough XP"
      pushLog(`skill upgrade blocked: ${blockedReason}`, "warning", currentAgent.name)
      return
    }

    setAgents((prev) =>
      prev.map((agent) => (agent.id === agentId ? upgradeAgentSkill(agent, skillId).agent : agent)),
    )

    pushLog(`${preview.result.skill.name} upgraded to level ${preview.result.skill.level}`, "success", preview.agent.name)
    showAgentOverlay(preview.agent, `${preview.result.skill.name} Lv.${preview.result.skill.level}`, preview.agent.color)
  }, [pushLog, showAgentOverlay])

  const handleUpdateAgentAppearance = useCallback((agentId: string, appearance: AgentAppearance) => {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === agentId
          ? { ...agent, appearance, color: appearance.customColor || agent.color }
          : agent,
      ),
    )
  }, [])

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
          floatingOverlays={floatingOverlays}
          particleTriggers={particleTriggers}
          audioEngine={audioEngine}
          districtStandings={districtStandings}
        />

        <DistrictEventOverlay event={activeDistrictEvent} standings={districtStandings} />

        <AudioControls engine={audioEngine} />

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

        <footer style={{
          position: "absolute",
          left: 12,
          bottom: 10,
          zIndex: 4,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          padding: "7px 9px",
          background: "rgba(3,7,18,0.78)",
          border: "1px solid rgba(42,58,82,0.86)",
          borderRadius: 6,
          backdropFilter: "blur(6px)",
        }}>
          {LEGAL_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              style={{
                color: "#94a3b8",
                fontFamily: "monospace",
                fontSize: 10,
                textDecoration: "none",
              }}
            >
              {link.label}
            </a>
          ))}
        </footer>
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
          onUpgradeSkill={handleUpgradeSkill}
          onUpdateAgentAppearance={handleUpdateAgentAppearance}
          colorBlindMode={colorBlindMode}
          onColorBlindModeChange={handleColorBlindModeChange}
        />
      )}
    </div>
  )
}
