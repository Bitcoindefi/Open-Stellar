import { DISTRICTS } from "@/lib/data"
import type { DistrictId } from "@/lib/types"

export type AgentMessageType = "task.request" | "task.response" | "data.share" | "status.query" | "chat"
export type AgentMessageTarget = string | "broadcast"

export interface AgentMessage {
  id: string
  fromAgentId: string
  toAgentId: AgentMessageTarget
  type: AgentMessageType
  payload: unknown
  replyTo?: string
  sentAt: string
  expiresAt?: string
  districtId?: DistrictId
}

export interface AgentMessageInput {
  fromAgentId: string
  toAgentId?: AgentMessageTarget
  type: AgentMessageType
  payload: unknown
  replyTo?: string
  expiresAt?: string
  districtId?: DistrictId
}

type MessageListener = (message: AgentMessage) => void

interface MessageBusState {
  messages: AgentMessage[]
  listeners: Map<string, Set<MessageListener>>
  sequence: number
}

const globalState = globalThis as typeof globalThis & {
  __openStellarAgentMessageBus__?: MessageBusState
}

const messageBus: MessageBusState = globalState.__openStellarAgentMessageBus__ ?? {
  messages: [],
  listeners: new Map(),
  sequence: 0,
}

if (!globalState.__openStellarAgentMessageBus__) {
  globalState.__openStellarAgentMessageBus__ = messageBus
}

function nextMessageId(type: AgentMessageType) {
  messageBus.sequence += 1
  return `msg_${type.replace(".", "_")}_${Date.now()}_${messageBus.sequence}`
}

export function resetAgentMessagesForTests() {
  messageBus.messages = []
  messageBus.listeners.clear()
  messageBus.sequence = 0
}

export function isAgentMessageType(value: unknown): value is AgentMessageType {
  return (
    value === "task.request" ||
    value === "task.response" ||
    value === "data.share" ||
    value === "status.query" ||
    value === "chat"
  )
}

export function isDistrictId(value: unknown): value is DistrictId {
  return typeof value === "string" && DISTRICTS.some((district) => district.id === value)
}

function normalizeMessage(input: AgentMessageInput): AgentMessage {
  if (!input.fromAgentId.trim()) {
    throw new Error("fromAgentId is required")
  }

  const toAgentId = input.toAgentId ?? "broadcast"
  if (!toAgentId.trim()) {
    throw new Error("toAgentId is required")
  }

  return {
    id: nextMessageId(input.type),
    fromAgentId: input.fromAgentId.trim(),
    toAgentId: toAgentId.trim(),
    type: input.type,
    payload: input.payload ?? {},
    replyTo: input.replyTo,
    sentAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
    districtId: input.districtId,
  }
}

function listenerKeysFor(message: AgentMessage) {
  const keys = new Set<string>([message.toAgentId])
  keys.add(message.fromAgentId)
  if (message.districtId) keys.add(`district:${message.districtId}`)
  return keys
}

function publish(message: AgentMessage) {
  for (const key of listenerKeysFor(message)) {
    const listeners = messageBus.listeners.get(key)
    if (!listeners) continue
    for (const listener of listeners) {
      listener(message)
    }
  }
}

export function sendAgentMessage(input: AgentMessageInput): AgentMessage {
  const message = normalizeMessage(input)
  messageBus.messages.unshift(message)
  messageBus.messages = messageBus.messages.slice(0, 500)
  publish(message)
  return message
}

export function broadcastDistrictMessage(districtId: DistrictId, input: Omit<AgentMessageInput, "toAgentId" | "districtId">): AgentMessage {
  return sendAgentMessage({
    ...input,
    toAgentId: "broadcast",
    districtId,
  })
}

export function listAgentMessages(agentId: string): AgentMessage[] {
  return messageBus.messages.filter((message) => (
    message.toAgentId === agentId ||
    message.fromAgentId === agentId ||
    message.toAgentId === "broadcast"
  ))
}

export function listDistrictMessages(districtId: DistrictId): AgentMessage[] {
  return messageBus.messages.filter((message) => message.districtId === districtId)
}

export function subscribeToAgentMessages(agentId: string, listener: MessageListener) {
  const listeners = messageBus.listeners.get(agentId) ?? new Set<MessageListener>()
  listeners.add(listener)
  messageBus.listeners.set(agentId, listeners)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) messageBus.listeners.delete(agentId)
  }
}

export function subscribeToDistrictMessages(districtId: DistrictId, listener: MessageListener) {
  const key = `district:${districtId}`
  const listeners = messageBus.listeners.get(key) ?? new Set<MessageListener>()
  listeners.add(listener)
  messageBus.listeners.set(key, listeners)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) messageBus.listeners.delete(key)
  }
}

export function encodeAgentMessageSse(message: AgentMessage) {
  return [
    `id: ${message.id}`,
    "event: agent.message",
    `data: ${JSON.stringify(message)}`,
    "",
    "",
  ].join("\n")
}

export function createAgentMessageStream(agentId: string) {
  const encoder = new TextEncoder()
  let cleanup = () => {}

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`: open-stellar messages for ${agentId}\n\n`))
      cleanup = subscribeToAgentMessages(agentId, (message) => {
        controller.enqueue(encoder.encode(encodeAgentMessageSse(message)))
      })
    },
    cancel() {
      cleanup()
    },
  })
}

export function agentMessageStreamHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  }
}
