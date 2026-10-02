import type { ChatStreamEvent, ToolLineStatus } from "@/lib/orchestration/events"

// Turns the chat stream into the transcript the chat panel renders and keeps in localStorage.
// Pure functions, so the browser code stays thin and this part is tested in node.

export const TRANSCRIPT_COLORS = {
  user: "#fbbf24",
  system: "#64748b",
  orchestrator: "#22d3ee",
  member: "#a78bfa",
  hired: "#5eead4",
}

export type TranscriptMessage = {
  kind: "message"
  id: string
  speaker: string
  role: "user" | "agent" | "system"
  target?: string
  message: string
  timestamp: string
  color: string
  turnId?: string
  hiredBy?: string
}
export type TranscriptTool = { kind: "tool"; id: string; turnId: string; status: ToolLineStatus; label: string; detail?: string }
export type TranscriptReceipt = { kind: "receipt"; id: string; fromName: string; toName: string; amount: string; transaction: string; explorerUrl: string }
export type TranscriptApproval = {
  kind: "approval"
  id: string
  token: string
  runId: string
  fromName: string
  toName: string
  task: string
  amount: string
  reason: "run" | "day"
  capUsdc: string
  expiresAt: number
  state: "pending" | "working" | "approved" | "rejected" | "expired" | "failed"
}
export type TranscriptItem = TranscriptMessage | TranscriptTool | TranscriptReceipt | TranscriptApproval

type TurnMeta = { speaker: string; model: string; color: string; hiredBy?: string }

export type TranscriptContext = {
  makeId: () => string
  timeLabel: () => string
  friendlyError: (message: string) => string
  turns: Map<string, TurnMeta>
}

export function createTranscriptContext(options: Omit<TranscriptContext, "turns">): TranscriptContext {
  return { ...options, turns: new Map() }
}

function systemMessage(ctx: TranscriptContext, message: string): TranscriptMessage {
  return { kind: "message", id: ctx.makeId(), speaker: "System", role: "system", message, timestamp: ctx.timeLabel(), color: TRANSCRIPT_COLORS.system }
}

export function applyChatEvent(items: TranscriptItem[], event: ChatStreamEvent, ctx: TranscriptContext): TranscriptItem[] {
  switch (event.type) {
    case "agent-start": {
      const color = event.hiredBy ? TRANSCRIPT_COLORS.hired : event.agentId === "orchestrator" ? TRANSCRIPT_COLORS.orchestrator : TRANSCRIPT_COLORS.member
      ctx.turns.set(event.turnId, { speaker: event.name, model: event.model, color, ...(event.hiredBy ? { hiredBy: event.hiredBy } : {}) })
      return items
    }
    case "text": {
      const last = items.at(-1)
      if (last && last.kind === "message" && last.turnId === event.turnId) {
        return [...items.slice(0, -1), { ...last, message: last.message + event.delta }]
      }
      const meta = ctx.turns.get(event.turnId) ?? { speaker: "Agent", model: "", color: TRANSCRIPT_COLORS.member }
      return [...items, {
        kind: "message",
        id: ctx.makeId(),
        speaker: meta.speaker,
        role: "agent",
        target: meta.hiredBy ? `hired by ${meta.hiredBy} · ${meta.model}` : meta.model,
        message: event.delta,
        timestamp: ctx.timeLabel(),
        color: meta.color,
        turnId: event.turnId,
        ...(meta.hiredBy ? { hiredBy: meta.hiredBy } : {}),
      }]
    }
    case "tool": {
      const index = items.findIndex((item) => item.kind === "tool" && item.id === event.callId)
      const next: TranscriptTool = { kind: "tool", id: event.callId, turnId: event.turnId, status: event.status, label: event.label, ...(event.detail ? { detail: event.detail } : {}) }
      if (index === -1) return [...items, next]
      return items.map((item, i) => (i === index ? next : item))
    }
    case "handoff":
      return [...items, {
        kind: "receipt",
        id: ctx.makeId(),
        fromName: event.fromName,
        toName: event.toName,
        amount: event.amount,
        transaction: event.receipt.transaction,
        explorerUrl: event.receipt.explorerUrl,
      }]
    case "approval":
      return [...items, {
        kind: "approval",
        id: ctx.makeId(),
        token: event.token,
        runId: event.runId,
        fromName: event.fromName,
        toName: event.toName,
        task: event.task,
        amount: event.amount,
        reason: event.reason,
        capUsdc: event.capUsdc,
        expiresAt: event.expiresAt,
        state: "pending",
      }]
    case "notice":
      return [...items, systemMessage(ctx, event.message)]
    case "error":
      return [...items, systemMessage(ctx, ctx.friendlyError(event.message))]
    default:
      return items
  }
}

export function setApprovalState(items: TranscriptItem[], id: string, state: TranscriptApproval["state"]): TranscriptItem[] {
  return items.map((item) => (item.kind === "approval" && item.id === id ? { ...item, state } : item))
}

/** The conversation the agents get as context: what people and agents said, not the tool lines. */
export function historyFrom(items: TranscriptItem[], limit = 12): Array<{ speaker: string; message: string }> {
  return items
    .filter((item): item is TranscriptMessage => item.kind === "message" && item.role !== "system")
    .slice(-limit)
    .map((item) => ({ speaker: item.speaker, message: item.message }))
}

/** Reads what localStorage holds, including transcripts saved before tool lines existed. */
export function normalizeStoredTranscript(value: unknown, limit = 120): TranscriptItem[] {
  if (!Array.isArray(value)) return []
  return value.slice(-limit).flatMap((item): TranscriptItem[] => {
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    // A pending approval survives a reload: its token still expires on the server's clock.
    if (record.kind === "approval" && record.state === "working") return [{ ...(record as TranscriptApproval), state: "pending" }]
    if (record.kind === "tool" || record.kind === "receipt" || record.kind === "approval") return [record as TranscriptItem]
    if (typeof record.message !== "string" || typeof record.speaker !== "string") return []
    return [{ ...(record as Omit<TranscriptMessage, "kind">), kind: "message" } as TranscriptMessage]
  })
}
