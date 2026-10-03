import { randomUUID } from "node:crypto"
import type { LanguageModel } from "ai"
import { BYOK_PROVIDERS, type ByokModelConnection } from "@/lib/ai/byok-provider"
import { streamAgentTurn } from "@/lib/ai/stream"
import { consumeApproval, type ApprovalSigner } from "@/lib/orchestration/approval"
import { microToUsdc, type OrchestratorCaps } from "@/lib/orchestration/budget"
import {
  HIRE_REFUSED_LABEL,
  awaitingApprovalLabel,
  describeToolCall,
  hiredLabel,
  paidButFailedLabel,
  type ChatStreamEvent,
} from "@/lib/orchestration/events"
import {
  HANDOFF_TOOL,
  createRunState,
  executeApprovedHandoff,
  handoffTool,
  type HandoffCaps,
  type HandoffDeps,
  type HandoffOutcome,
  type RosterAgent,
  type RunState,
} from "@/lib/orchestration/handoff"
import type { KvStore } from "@/lib/security/kv-store"

// One chat request, start to finish: the addressed agent answers as a stream, may hire teammates
// (each hire a paid x402 task), and every step is emitted for the transcript. An approved hire
// arrives as its own request carrying the signed approval token.

export type ChatTarget = "orchestrator" | "team" | `member:${string}`
export type ChatHistoryItem = { speaker: string; message: string }

export type ChatRunInput = {
  message: string
  target: ChatTarget
  context: string
  history: ChatHistoryItem[]
  orchestrator: RosterAgent
  members: RosterAgent[]
  approval?: { token: string; runId: string; decision: "approve" | "reject" }
}

export type ChatRunDeps = {
  modelFor: (connection: ByokModelConnection) => LanguageModel
  hire: HandoffDeps["hire"]
  /** The browser id (see lib/identity/browser-id.ts). */
  owner: string
  /** The browser's agents' wallet, which pays the hires. */
  wallet: HandoffDeps["wallet"]
  store: KvStore
  budget: OrchestratorCaps
  caps: HandoffCaps
  priceMicro: number
  approvals: ApprovalSigner | null
  now?: () => Date
  newRunId?: () => string
}

type Mode = "orchestrator" | "team" | "member"

function systemFor(agent: RosterAgent, mode: Mode, teammates: RosterAgent[], canHire: boolean, price: string): string {
  const lines = [
    `You are ${agent.name}, an AI agent in Agentic City, a city of AI agents on Solana. Your role is: ${agent.role}.`,
    "Answer the user's latest message as this agent. Stay concise, practical, and honest about limits.",
    "Do not claim blockchain actions, payments, messages, or code changes unless they happened in this conversation.",
  ]
  if (teammates.length > 0 && canHire) {
    lines.push(
      `Your teammates, hired with the ${HANDOFF_TOOL} tool by id or name: ${teammates.map((item) => `${item.name} (id ${item.id}): ${item.role}`).join("; ")}.`,
      `Each hire pays that teammate ${price} USDC on Solana devnet from the person's agents' wallet, which they fund themselves. The person sees the payment and the teammate's answer, so do not repeat it.`,
    )
    lines.push(mode === "team"
      ? "The person addressed the whole team. Decide which teammates' roles this needs, hire each of them once with a specific task, then write a short synthesis."
      : "Answer directly when you can. Hire a teammate only when the work clearly needs their role.")
  } else if (teammates.length > 0) {
    lines.push(`Your teammates are ${teammates.map((item) => `${item.name}: ${item.role}`).join("; ")}. Hiring them is not available right now, so answer yourself.`)
  }
  return lines.join("\n")
}

export async function runChat(input: ChatRunInput, deps: ChatRunDeps, emit: (event: ChatStreamEvent) => void): Promise<void> {
  let turnCounter = 0
  const newTurnId = (agentId: string) => `${agentId}-${++turnCounter}`
  const price = microToUsdc(deps.priceMicro)
  const runId = input.approval?.runId ?? deps.newRunId?.() ?? randomUUID()
  const run: RunState = createRunState(runId)
  const handoffDeps: HandoffDeps = {
    roster: input.members,
    caps: deps.caps,
    budget: deps.budget,
    priceMicro: deps.priceMicro,
    store: deps.store,
    owner: deps.owner,
    wallet: deps.wallet,
    hire: deps.hire,
    approvals: deps.approvals,
    emit,
    newTurnId,
    now: deps.now,
  }

  emit({
    type: "run",
    runId,
    hiring: Boolean(deps.hire),
    perRunUsdc: microToUsdc(deps.budget.perRunMicro),
    perDayUsdc: microToUsdc(deps.budget.perDayMicro),
    wallet: deps.wallet?.address ?? null,
  })
  const finish = () => emit({ type: "done", runId, spent: microToUsdc(run.spentMicro), receipts: run.receipts })

  if (input.approval) {
    await resumeApproval(input.approval, deps, handoffDeps, run, emit)
    finish()
    return
  }

  const prompt = JSON.stringify({ context: input.context, conversation: input.history, latestUserMessage: input.message })

  async function runTurn(agent: RosterAgent, mode: Mode) {
    const turnId = newTurnId(agent.id)
    const outcomes = new Map<string, HandoffOutcome>()
    const from = { id: agent.id, name: agent.name, depth: 0, turnId }
    const hireTool = handoffTool(handoffDeps, run, from, (callId, outcome) => outcomes.set(callId, outcome))
    const teammates = input.members.filter((item) => item.id !== agent.id)

    emit({ type: "agent-start", turnId, agentId: agent.id, name: agent.name, model: agent.connection.model, depth: 0 })
    try {
      await streamAgentTurn({
        model: deps.modelFor(agent.connection),
        label: BYOK_PROVIDERS[agent.connection.provider]?.label ?? agent.connection.provider,
        system: systemFor(agent, mode, teammates, Boolean(hireTool && deps.hire), price),
        prompt,
        tools: hireTool ? { [HANDOFF_TOOL]: hireTool } : undefined,
        shouldStop: () => run.approvalPending,
        onEvent: (event) => {
          if (event.type === "text") {
            emit({ type: "text", turnId, delta: event.delta })
          } else if (event.type === "tool-call") {
            emit({ type: "tool", turnId, callId: event.toolCallId, status: "running", ...describeToolCall(event.toolName, event.input) })
          } else if (event.type === "tool-result") {
            const outcome = outcomes.get(event.toolCallId)
            if (outcome?.ok) {
              emit({ type: "tool", turnId, callId: event.toolCallId, status: "done", label: hiredLabel(outcome.toName, price), detail: outcome.receipt.transaction })
            } else if (outcome?.paid) {
              emit({ type: "tool", turnId, callId: event.toolCallId, status: "failed", label: paidButFailedLabel(outcome.paid.toName, price), detail: outcome.refusal })
            } else if (outcome && outcome.approval) {
              emit({ type: "tool", turnId, callId: event.toolCallId, status: "approval", label: awaitingApprovalLabel(outcome.approval.toName) })
            } else {
              emit({ type: "tool", turnId, callId: event.toolCallId, status: "refused", label: HIRE_REFUSED_LABEL, detail: outcome?.refusal ?? String(event.output) })
            }
          } else {
            emit({ type: "tool", turnId, callId: event.toolCallId, status: "failed", label: describeToolCall(event.toolName, undefined).label, detail: event.error.slice(0, 200) })
          }
        },
      })
    } finally {
      emit({ type: "agent-end", turnId })
    }
  }

  try {
    if (input.target === "team") {
      await runTurn(input.orchestrator, "team")
    } else if (input.target.startsWith("member:")) {
      const member = input.members.find((item) => `member:${item.id}` === input.target)
      if (!member) throw new Error("El agente elegido no está en el equipo guardado.")
      await runTurn(member, "member")
    } else {
      await runTurn(input.orchestrator, "orchestrator")
    }
  } catch (error) {
    emit({ type: "error", message: error instanceof Error ? error.message : "No se pudo enviar el mensaje del chat." })
  }
  finish()
}

async function resumeApproval(
  approval: NonNullable<ChatRunInput["approval"]>,
  deps: ChatRunDeps,
  handoffDeps: HandoffDeps,
  run: RunState,
  emit: (event: ChatStreamEvent) => void,
) {
  if (!deps.approvals) {
    emit({ type: "error", message: "Las aprobaciones no están disponibles en este servidor." })
    return
  }
  const verified = deps.approvals.verify(approval.token, approval.runId, deps.owner, deps.now?.().getTime())
  if (!verified.ok) {
    emit({ type: "error", message: verified.error })
    return
  }
  const payload = verified.payload
  let fresh: boolean
  try {
    fresh = await consumeApproval(deps.store, payload, deps.now?.().getTime())
  } catch {
    emit({ type: "error", message: "No se pudo registrar la aprobación en este momento, así que no se pagó nada. Probá de nuevo." })
    return
  }
  if (!fresh) {
    emit({ type: "error", message: "Esta aprobación ya se usó." })
    return
  }
  if (approval.decision === "reject") {
    emit({ type: "notice", message: `Rechazaste. ${payload.fromName} no contrató a ${payload.toName} y no se pagó nada.` })
    return
  }
  emit({ type: "notice", message: `Aprobado. ${payload.fromName} está contratando a ${payload.toName} por ${microToUsdc(payload.amountMicro)} USDC.` })
  const outcome = await executeApprovedHandoff(handoffDeps, run, payload)
  if (!outcome.ok) emit({ type: "notice", message: outcome.refusal })
}
