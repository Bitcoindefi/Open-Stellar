import { describe, expect, it } from "vitest"
import {
  HIRE_REFUSED_LABEL,
  approvalCapWords,
  approvalStatusLabel,
  awaitingApprovalLabel,
  createEventParser,
  describeToolCall,
  encodeEvent,
  hiredByLabel,
  hiredLabel,
  paidButFailedLabel,
  receiptLabel,
  shortSignature,
  toolLineText,
  type ChatStreamEvent,
} from "@/lib/orchestration/events"
import {
  TRANSCRIPT_COLORS,
  applyChatEvent,
  createTranscriptContext,
  historyFrom,
  normalizeStoredTranscript,
  setApprovalState,
  type TranscriptItem,
} from "@/lib/orchestration/transcript"

const receipt = { transaction: "5igSignatureLong", network: "solana:devnet", payer: "P", amount: "10000", asset: "USDC", explorerUrl: "https://explorer.solana.com/tx/5igSignatureLong?cluster=devnet" }

function ctx() {
  let n = 0
  return createTranscriptContext({ makeId: () => `id${++n}`, timeLabel: () => "12:00", friendlyError: (message) => `friendly: ${message}` })
}

function play(events: ChatStreamEvent[], items: TranscriptItem[] = []) {
  const context = ctx()
  return events.reduce((acc, event) => applyChatEvent(acc, event, context), items)
}

describe("events", () => {
  it("encodes one JSON object per line and parses chunks split anywhere", () => {
    const events: ChatStreamEvent[] = [{ type: "text", turnId: "a", delta: "Hola\nequipo" }, { type: "notice", message: "ok" }]
    const wire = events.map((event) => new TextDecoder().decode(encodeEvent(event))).join("")
    const seen: ChatStreamEvent[] = []
    const parser = createEventParser((event) => seen.push(event))
    for (let i = 0; i < wire.length; i += 7) parser.push(wire.slice(i, i + 7))
    parser.push("not json\n{\"no\":1}\n")
    parser.push(JSON.stringify({ type: "notice", message: "tail" }))
    parser.end()
    expect(seen).toEqual([...events, { type: "notice", message: "tail" }])
  })

  it("words tool lines for people", () => {
    expect(describeToolCall("message_agent", { agent: "Investigador", task: "Find   three\noptions" })).toEqual({ label: "Contratando a Investigador", detail: "Find three options" })
    expect(describeToolCall("message_agent", { task: "x".repeat(200) }).detail).toHaveLength(90)
    expect(describeToolCall("message_agent", undefined)).toEqual({ label: "Contratando a un agente" })
    expect(describeToolCall("search", {})).toEqual({ label: "Usó search" })
    expect(hiredLabel("Investigador", "0.01")).toBe("Investigador contratado por 0.01 USDC")
    expect(shortSignature("5igSignatureLong")).toBe("5igSig...reLong")
    expect(shortSignature("short")).toBe("short")
  })

  it("words receipts, tool states and the approval card in Spanish", () => {
    expect(paidButFailedLabel("Investigador", "0.01")).toBe("Investigador cobró 0.01 USDC")
    expect(awaitingApprovalLabel("Critico")).toBe("Esperando tu aprobación para contratar a Critico")
    expect(HIRE_REFUSED_LABEL).toBe("Contratación no realizada")
    expect(receiptLabel("Supervisor", "Critico", "0.01")).toBe("Supervisor contrató a Critico y pagó 0.01 USDC")
    expect(hiredByLabel("Supervisor", "grok")).toBe("contratado por Supervisor · grok")
    expect(toolLineText("failed", "Critico cobró 0.01 USDC")).toBe("Critico cobró 0.01 USDC (falló)")
    expect(toolLineText("done", "ok")).toBe("ok")
    expect(approvalStatusLabel("pending", 125)).toBe("vence en 2:05")
    expect(approvalStatusLabel("pending", -3)).toBe("vence en 0:00")
    expect(approvalStatusLabel("working", 10)).toBe("enviando...")
    expect(approvalStatusLabel("approved", 0)).toBe("aprobada")
    expect(approvalStatusLabel("rejected", 0)).toBe("rechazada")
    expect(approvalStatusLabel("expired", 0)).toBe("vencida")
    expect(approvalStatusLabel("failed", 0)).toBe("no enviada")
    expect(approvalCapWords("run")).toBe("por conversación")
    expect(approvalCapWords("day")).toBe("diario")
  })
})

describe("transcript", () => {
  it("builds messages, tool lines, receipts and approval cards from the stream", () => {
    const items = play([
      { type: "run", runId: "r", hiring: true, perRunUsdc: "0.05", perDayUsdc: "0.5" },
      { type: "agent-start", turnId: "o-1", agentId: "orchestrator", name: "Supervisor", model: "claude", depth: 0 },
      { type: "text", turnId: "o-1", delta: "Hiring " },
      { type: "text", turnId: "o-1", delta: "one." },
      { type: "tool", turnId: "o-1", callId: "c1", status: "running", label: "Hiring Investigador" },
      { type: "handoff", turnId: "o-1", fromName: "Supervisor", toName: "Investigador", task: "t", amount: "0.01", receipt },
      { type: "agent-start", turnId: "r-2", agentId: "research", name: "Investigador", model: "grok", depth: 1, hiredBy: "Supervisor" },
      { type: "text", turnId: "r-2", delta: "Options" },
      { type: "agent-end", turnId: "r-2" },
      { type: "tool", turnId: "o-1", callId: "c1", status: "done", label: "Hired Investigador, paid 0.01 USDC", detail: "5igSignatureLong" },
      { type: "text", turnId: "o-1", delta: "Summary" },
      { type: "approval", token: "tok", runId: "r", fromName: "Supervisor", toName: "Critico", task: "t2", amount: "0.01", reason: "run", capUsdc: "0.05", expiresAt: 99 },
      { type: "notice", message: "note" },
      { type: "error", message: "boom" },
      { type: "done", runId: "r", spent: "0.01", receipts: [receipt] },
    ])

    expect(items.map((item) => item.kind)).toEqual(["message", "tool", "receipt", "message", "message", "approval", "message", "message"])
    expect(items[0]).toMatchObject({ speaker: "Supervisor", message: "Hiring one.", color: TRANSCRIPT_COLORS.orchestrator, target: "claude" })
    expect(items[1]).toEqual({ kind: "tool", id: "c1", turnId: "o-1", status: "done", label: "Hired Investigador, paid 0.01 USDC", detail: "5igSignatureLong" })
    expect(items[2]).toMatchObject({ kind: "receipt", fromName: "Supervisor", toName: "Investigador", amount: "0.01", explorerUrl: receipt.explorerUrl })
    expect(items[3]).toMatchObject({ speaker: "Investigador", message: "Options", color: TRANSCRIPT_COLORS.hired, target: "contratado por Supervisor · grok", hiredBy: "Supervisor" })
    expect(items[4]).toMatchObject({ speaker: "Supervisor", message: "Summary" })
    expect(items[5]).toMatchObject({ kind: "approval", token: "tok", state: "pending" })
    expect(items[7]).toMatchObject({ role: "system", message: "friendly: boom" })
  })

  it("falls back for text from an unknown turn and colors members", () => {
    const items = play([
      { type: "agent-start", turnId: "m-1", agentId: "critic", name: "Critico", model: "m", depth: 0 },
      { type: "text", turnId: "m-1", delta: "a" },
      { type: "text", turnId: "zzz", delta: "b" },
    ])
    expect(items[0]).toMatchObject({ color: TRANSCRIPT_COLORS.member })
    expect(items[1]).toMatchObject({ speaker: "Agente", message: "b" })
  })

  it("updates approval state and builds history from messages only", () => {
    const items = play([
      { type: "agent-start", turnId: "o-1", agentId: "orchestrator", name: "Supervisor", model: "m", depth: 0 },
      { type: "text", turnId: "o-1", delta: "hi" },
      { type: "approval", token: "tok", runId: "r", fromName: "S", toName: "C", task: "t", amount: "0.01", reason: "day", capUsdc: "0.5", expiresAt: 1 },
      { type: "notice", message: "system note" },
    ], [{ kind: "message", id: "u", speaker: "You", role: "user", message: "hello", timestamp: "", color: "" }])

    const approvalId = items.find((item) => item.kind === "approval")!.id
    expect(setApprovalState(items, approvalId, "approved").find((item) => item.kind === "approval")).toMatchObject({ state: "approved" })
    expect(historyFrom(items)).toEqual([{ speaker: "You", message: "hello" }, { speaker: "Supervisor", message: "hi" }])
    expect(historyFrom(items, 1)).toEqual([{ speaker: "Supervisor", message: "hi" }])
  })

  it("shows one Fund card per agents' wallet when a hire could not be paid", () => {
    const wallet = (balanceUsdc: string): ChatStreamEvent => ({ type: "wallet", status: "unfunded", address: "Wallet1", balanceUsdc, neededUsdc: "0.01" })
    const items = play([wallet("0"), { type: "notice", message: "later" }, wallet("0.005")])
    expect(items.filter((item) => item.kind === "fund")).toEqual([{ kind: "fund", id: "id3", address: "Wallet1", balanceUsdc: "0.005", neededUsdc: "0.01" }])
    expect(items.at(-1)?.kind).toBe("fund")
    expect(play([{ type: "run", runId: "r", hiring: true, perRunUsdc: "0.05", perDayUsdc: "0.5", wallet: "Wallet1" }])).toEqual([])
  })

  it("reads stored transcripts, including ones saved before tool lines existed", () => {
    expect(normalizeStoredTranscript("nope")).toEqual([])
    const stored = normalizeStoredTranscript([
      { id: "1", speaker: "You", role: "user", message: "old", timestamp: "", color: "" },
      { kind: "tool", id: "c1", turnId: "t", status: "done", label: "x" },
      { kind: "approval", id: "a", state: "working" },
      { kind: "receipt", id: "r" },
      { kind: "fund", id: "f", address: "W", balanceUsdc: "0", neededUsdc: "0.01" },
      null,
      { speaker: 1 },
    ])
    expect(stored.map((item) => item.kind)).toEqual(["message", "tool", "approval", "receipt", "fund"])
    expect(stored[2]).toMatchObject({ state: "pending" })
    expect(normalizeStoredTranscript(Array.from({ length: 5 }, (_, i) => ({ speaker: "s", message: String(i) })), 2)).toHaveLength(2)
  })
})
