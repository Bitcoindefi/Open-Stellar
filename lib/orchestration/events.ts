import type { HopReceipt } from "@/lib/orchestration/wallet"

// What the chat route streams to the browser, one JSON object per line (NDJSON).
// The browser builds the transcript from these: agent text as it is written, one readable line
// per tool call, a receipt line per paid hire and an approval card when a hire needs the person.

export type ToolLineStatus = "running" | "done" | "refused" | "failed" | "approval"

export type ApprovalRequestEvent = {
  type: "approval"
  token: string
  runId: string
  fromName: string
  toName: string
  task: string
  amount: string
  reason: "run" | "day"
  capUsdc: string
  expiresAt: number
}

/** The agents' wallet holds less than a hire costs: the chat shows the Fund button. */
export type WalletFundEvent = { type: "wallet"; status: "unfunded"; address: string; balanceUsdc: string; neededUsdc: string }

export type ChatStreamEvent =
  | { type: "run"; runId: string; hiring: boolean; perRunUsdc: string; perDayUsdc: string; wallet?: string | null }
  | WalletFundEvent
  | { type: "agent-start"; turnId: string; agentId: string; name: string; model: string; depth: number; hiredBy?: string }
  | { type: "text"; turnId: string; delta: string }
  | { type: "agent-end"; turnId: string }
  | { type: "tool"; turnId: string; callId: string; status: ToolLineStatus; label: string; detail?: string }
  | { type: "handoff"; turnId: string; fromName: string; toName: string; task: string; amount: string; receipt: HopReceipt }
  | ApprovalRequestEvent
  | { type: "notice"; message: string }
  | { type: "error"; message: string }
  | { type: "done"; runId: string; spent: string; receipts: HopReceipt[] }

export function encodeEvent(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`)
}

/** Parses NDJSON chunks as they arrive. Keeps an incomplete trailing line for the next chunk. */
export function createEventParser(onEvent: (event: ChatStreamEvent) => void) {
  let buffer = ""
  const flushLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    try {
      const parsed = JSON.parse(trimmed) as ChatStreamEvent
      if (parsed && typeof parsed === "object" && typeof parsed.type === "string") onEvent(parsed)
    } catch {
      // A malformed line is skipped; the rest of the run still renders.
    }
  }
  return {
    push(chunk: string) {
      buffer += chunk
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      lines.forEach(flushLine)
    },
    end() {
      flushLine(buffer)
      buffer = ""
    },
  }
}

function clip(text: string, max = 90): string {
  const single = text.replace(/\s+/g, " ").trim()
  return single.length > max ? `${single.slice(0, max - 3)}...` : single
}

/**
 * Words for a tool line, written for the person reading the transcript rather than for a log
 * (idea from CopilotKit/openbot, MIT, app/src/components/channels/tool-line.tsx).
 */
export function describeToolCall(toolName: string, input: unknown): { label: string; detail?: string } {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {}
  if (toolName === "message_agent") {
    const agent = typeof record.agent === "string" && record.agent.trim() ? record.agent.trim() : "an agent"
    const task = typeof record.task === "string" ? clip(record.task) : ""
    return { label: `Hiring ${clip(agent, 40)}`, ...(task ? { detail: task } : {}) }
  }
  return { label: `Used ${toolName}` }
}

export function hiredLabel(toName: string, amount: string): string {
  return `Hired ${toName}, paid ${amount} USDC`
}

export function shortSignature(signature: string): string {
  return signature.length > 14 ? `${signature.slice(0, 6)}...${signature.slice(-6)}` : signature
}
