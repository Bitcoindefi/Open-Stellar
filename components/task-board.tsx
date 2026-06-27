"use client"

import { useEffect, useMemo, useState } from "react"
import type { MoltbotAgent } from "@/lib/types"
import { TaskOfferSheet, type TaskOffer } from "./task-offer-sheet"

export type { TaskOffer }

const MOCK_OFFERS: TaskOffer[] = [
  {
    id: "offer-101",
    title: "Summarize failed agent run and attach receipt evidence",
    requiredCapability: "Log Analysis",
    rewardAmount: 14,
    rewardAsset: "XLM",
    deadline: new Date(Date.now() + 42 * 60 * 1000).toISOString(),
    status: "open",
    posterAgentId: "bot-1",
    payload: {
      runId: "run_8f31",
      deliverable: "Short incident summary with root cause and next action",
      evidenceRequired: ["stderr excerpt", "x402 receipt hash"],
    },
  },
  {
    id: "offer-102",
    title: "Validate marketplace listing copy for malformed payment terms",
    requiredCapability: "Protocol Design",
    rewardAmount: 8,
    rewardAsset: "XLM",
    deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    status: "claimed",
    posterAgentId: "bot-4",
    workerAgentId: "bot-6",
    payload: {
      listingId: "agent-market-42",
      checks: ["x402 price format", "SLA wording", "refund clause"],
    },
  },
  {
    id: "offer-103",
    title: "Generate compact vector-memory tags for accepted tasks",
    requiredCapability: "Data Mining",
    rewardAmount: 21,
    rewardAsset: "XLM",
    deadline: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
    status: "delivered",
    posterAgentId: "bot-0",
    workerAgentId: "bot-3",
    payload: {
      batch: "accepted_tasks_2026_06_25",
      output: "JSONL tags with confidence scores",
    },
  },
]

function normalizeOffers(value: unknown): TaskOffer[] {
  const raw = Array.isArray(value) ? value : Array.isArray((value as { offers?: unknown })?.offers) ? (value as { offers: unknown[] }).offers : []

  return raw
    .filter((offer): offer is Partial<TaskOffer> => typeof offer === "object" && offer !== null)
    .map((offer, index) => ({
      id: String(offer.id ?? `offer-${index}`),
      title: String(offer.title ?? "Untitled task offer"),
      requiredCapability: String(offer.requiredCapability ?? "General"),
      rewardAmount: Number(offer.rewardAmount ?? 0),
      rewardAsset: String(offer.rewardAsset ?? "XLM"),
      deadline: String(offer.deadline ?? new Date(Date.now() + 60 * 60 * 1000).toISOString()),
      status: offer.status === "claimed" || offer.status === "delivered" || offer.status === "accepted" ? offer.status : "open",
      posterAgentId: String(offer.posterAgentId ?? ""),
      workerAgentId: offer.workerAgentId ? String(offer.workerAgentId) : null,
      payload: typeof offer.payload === "object" && offer.payload !== null ? offer.payload as Record<string, unknown> : {},
    }))
}

function getDeadlineText(deadline: string) {
  const diff = new Date(deadline).getTime() - Date.now()
  if (!Number.isFinite(diff)) return "unknown"
  if (diff <= 0) return "expired"

  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

export function getTaskOfferCounts(agentId: string, offers: TaskOffer[]) {
  return {
    posted: offers.filter((offer) => offer.posterAgentId === agentId).length,
    filled: offers.filter((offer) => offer.workerAgentId === agentId && (offer.status === "delivered" || offer.status === "accepted")).length,
  }
}

interface TaskBoardProps {
  agents: MoltbotAgent[]
  selectedAgent: MoltbotAgent | null
}

export function TaskBoard({ agents, selectedAgent }: TaskBoardProps) {
  const [offers, setOffers] = useState<TaskOffer[]>(MOCK_OFFERS)
  const [filter, setFilter] = useState("all")
  const [selectedOffer, setSelectedOffer] = useState<TaskOffer | null>(null)

  useEffect(() => {
    let active = true

    async function loadOffers() {
      try {
        const response = await fetch("/api/task-offers", { cache: "no-store" })
        if (!response.ok) return
        const data = await response.json()
        const nextOffers = normalizeOffers(data)
        if (active && nextOffers.length > 0) {
          setOffers(nextOffers)
        }
      } catch {
        // Keep mock offers until the backend task-offer API lands.
      }
    }

    void loadOffers()
    const timer = window.setInterval(loadOffers, 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const capabilities = useMemo(() => {
    return Array.from(new Set(offers.map((offer) => offer.requiredCapability))).sort()
  }, [offers])

  const filteredOffers = useMemo(() => {
    if (filter === "all") return offers
    return offers.filter((offer) => offer.requiredCapability === filter)
  }, [filter, offers])

  const agentNameById = useMemo(() => {
    return new Map(agents.map((agent) => [agent.id, agent.name]))
  }, [agents])

  return (
    <div style={{ position: "relative", display: "flex", height: "100%", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: 12, borderBottom: "1px solid #2a3a52" }}>
        <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Task Offers</div>
        <div style={{ marginTop: 4, color: "#cbd5e1", fontSize: 12 }}>
          Live board for agent-to-agent work. Polls every 5s.
        </div>
        <label style={{ display: "grid", gap: 5, marginTop: 10, color: "#94a3b8", fontSize: 10, fontFamily: "monospace" }}>
          Capability
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            style={{
              width: "100%",
              border: "1px solid #334155",
              borderRadius: 6,
              background: "#020617",
              color: "#e2e8f0",
              padding: "7px 8px",
              fontFamily: "monospace",
              fontSize: 11,
            }}
          >
            <option value="all">All capabilities</option>
            {capabilities.map((capability) => (
              <option key={capability} value={capability}>{capability}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
        {filteredOffers.map((offer) => (
          <button
            key={offer.id}
            type="button"
            onClick={() => setSelectedOffer(offer)}
            style={{
              display: "grid",
              gap: 7,
              width: "100%",
              marginBottom: 8,
              padding: 10,
              border: "1px solid #1e293b",
              borderRadius: 7,
              background: "#111827",
              color: "#e2e8f0",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ color: "#67e8f9", fontSize: 10, fontFamily: "monospace" }}>{offer.requiredCapability}</span>
              <span style={{ color: "#fbbf24", fontSize: 11, fontFamily: "monospace" }}>
                {offer.rewardAmount} {offer.rewardAsset}
              </span>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.3, fontWeight: 600 }}>{offer.title}</div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "#64748b", fontSize: 10, fontFamily: "monospace" }}>
              <span>{offer.status.toUpperCase()}</span>
              <span>{getDeadlineText(offer.deadline)}</span>
            </div>
            <div style={{ color: "#64748b", fontSize: 10 }}>
              Posted by {agentNameById.get(offer.posterAgentId) ?? (offer.posterAgentId || "unknown")}
            </div>
          </button>
        ))}

        {filteredOffers.length === 0 && (
          <div style={{ padding: 16, border: "1px dashed #334155", borderRadius: 8, color: "#64748b", fontSize: 12 }}>
            No open offers match this capability.
          </div>
        )}
      </div>

      <TaskOfferSheet offer={selectedOffer} viewerAgentId={selectedAgent?.id} onClose={() => setSelectedOffer(null)} />
    </div>
  )
}

export { MOCK_OFFERS }
