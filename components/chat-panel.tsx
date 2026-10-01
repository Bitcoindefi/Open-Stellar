"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Bot, BrainCircuit, Loader2, Send, UsersRound } from "lucide-react"
import type { ChatMessage } from "@/lib/types"
import { friendlyProviderError } from "@/lib/ai/friendly-error"

const CONNECTIONS_STORAGE_KEY = "agentic-city:connections:v1"
const CHAT_STORAGE_KEY = "agentic-city:agent-chat:v1"
const CONNECTIONS_UPDATED_EVENT = "agentic-city:connections-updated"

type ProviderId = "vercel-ai-gateway" | "openai" | "anthropic" | "groq" | "openrouter"
type ProviderConnection = { id: string; provider: ProviderId; name: string; model: string; apiKey: string; updatedAt: string; auth?: "oauth" }
type TeamMember = { id: string; name: string; role: string; connectionId: string }
type TeamConfig = { name: string; orchestratorId: string; members: TeamMember[] }
type SavedConnections = { providers: ProviderConnection[]; team: TeamConfig | null }
type ChatTarget = "orchestrator" | "team" | `member:${string}`
type AgentChatMessage = { id: string; speaker: string; role: "user" | "agent" | "system"; target?: string; message: string; timestamp: string; color: string }

interface ChatPanelProps {
  messages: ChatMessage[]
}

const targetColor = {
  user: "#fbbf24",
  system: "#64748b",
  orchestrator: "#22d3ee",
  member: "#a78bfa",
}

function readConnections(): SavedConnections {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONNECTIONS_STORAGE_KEY) || "{}") as Partial<SavedConnections>
    return {
      providers: Array.isArray(parsed.providers) ? parsed.providers : [],
      team: parsed.team && typeof parsed.team === "object" ? parsed.team : null,
    }
  } catch {
    return { providers: [], team: null }
  }
}

function readChat(): AgentChatMessage[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "[]") as AgentChatMessage[]
    return Array.isArray(parsed) ? parsed.slice(-80) : []
  } catch {
    return []
  }
}

function writeChat(messages: AgentChatMessage[]) {
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-80)))
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function ChatPanel({ messages }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [connections, setConnections] = useState<SavedConnections>({ providers: [], team: null })
  const [chat, setChat] = useState<AgentChatMessage[]>([])
  const [target, setTarget] = useState<ChatTarget>("orchestrator")
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = () => setConnections(readConnections())
    load()
    setChat(readChat())
    window.addEventListener(CONNECTIONS_UPDATED_EVENT, load)
    window.addEventListener("storage", load)
    return () => {
      window.removeEventListener(CONNECTIONS_UPDATED_EVENT, load)
      window.removeEventListener("storage", load)
    }
  }, [])

  const team = connections.team
  const generativeModels = useMemo(() => connections.providers.filter((item) => !/\bjev$/i.test(item.model)), [connections.providers])
  const orchestrator = team ? generativeModels.find((item) => item.id === team.orchestratorId) : null
  const members = useMemo(() => {
    if (!team) return []
    return team.members.flatMap((member) => {
      const connection = generativeModels.find((item) => item.id === member.connectionId)
      return connection ? [{ ...member, connection }] : []
    })
  }, [generativeModels, team])
  const canChat = Boolean(team && orchestrator && members.length > 0)

  useEffect(() => {
    if (target === "orchestrator" && orchestrator) return
    if (target === "team" && members.length > 0) return
    if (target.startsWith("member:") && members.some((member) => `member:${member.id}` === target)) return
    setTarget(orchestrator ? "orchestrator" : members[0] ? `member:${members[0].id}` : "orchestrator")
  }, [members, orchestrator, target])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [chat.length, messages.length])

  const persistChat = (next: AgentChatMessage[]) => {
    setChat(next)
    writeChat(next)
  }

  const sendMessage = async () => {
    const message = draft.trim()
    if (!message || !team || !orchestrator || members.length === 0 || sending) return

    const userMessage: AgentChatMessage = {
      id: makeId(),
      speaker: "You",
      role: "user",
      target,
      message,
      timestamp: nowLabel(),
      color: targetColor.user,
    }
    const nextChat = [...chat, userMessage]
    persistChat(nextChat)
    setDraft("")
    setSending(true)
    setError("")

    try {
      const response = await fetch("/api/connections/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          message,
          target,
          context: `Team ${team.name} inside Agentic City. The user is chatting from the app sidebar.`,
          history: nextChat.slice(-12).map((item) => ({ speaker: item.speaker, message: item.message })),
          orchestrator: {
            name: orchestrator.name,
            connection: { provider: orchestrator.provider, model: orchestrator.model, apiKey: orchestrator.apiKey, auth: orchestrator.auth },
          },
          members: members.map((member) => ({
            id: member.id,
            name: member.name,
            role: member.role,
            connection: { provider: member.connection.provider, model: member.connection.model, apiKey: member.connection.apiKey, auth: member.connection.auth },
          })),
        }),
      })
      const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; responses?: Array<{ id: string; name: string; role: string; model: string; message: string }> }
      if (!response.ok || !data.ok || !Array.isArray(data.responses)) throw new Error(data.error || "No se pudo contactar al equipo.")
      const agentMessages: AgentChatMessage[] = data.responses.map((item) => ({
        id: makeId(),
        speaker: item.name,
        role: "agent",
        target: item.model,
        message: item.message,
        timestamp: nowLabel(),
        color: item.id === "orchestrator" ? targetColor.orchestrator : targetColor.member,
      }))
      persistChat([...nextChat, ...agentMessages])
    } catch (sendError) {
      const messageText = sendError instanceof Error ? friendlyProviderError(sendError.message) : "Falló el chat con agentes."
      setError(messageText)
      persistChat([...nextChat, {
        id: makeId(),
        speaker: "System",
        role: "system",
        message: messageText,
        timestamp: nowLabel(),
        color: targetColor.system,
      }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0a0f1a" }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 7, border: "1px solid #22d3ee44", background: "#22d3ee12", color: "#67e8f9" }}>
          <BrainCircuit size={15} aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 800, color: "#dbeafe", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Agent chat
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {canChat ? `${team?.name} · ${members.length} agentes` : "Configurá Modelos IA > Equipo"}
          </div>
        </div>
        <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 10, color: "#475569" }}>{chat.length} msgs</span>
      </div>

      <div style={{ padding: 10, borderBottom: "1px solid #1e293b", display: "grid", gap: 8 }}>
        <label style={{ display: "grid", gap: 5 }}>
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Hablar con</span>
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value as ChatTarget)}
            disabled={!canChat || sending}
            style={{ width: "100%", border: "1px solid #263449", borderRadius: 7, background: "#050a12", color: "#dbeafe", padding: "9px 10px", fontFamily: "monospace", fontSize: 11, outline: "none" }}
          >
            <option value="orchestrator">Orquestador</option>
            <option value="team">Equipo completo</option>
            {members.map((member) => <option key={member.id} value={`member:${member.id}`}>{member.name} · {member.role}</option>)}
          </select>
        </label>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {!canChat ? (
          <div style={{ margin: "auto 0", border: "1px dashed #334155", borderRadius: 8, padding: 16, textAlign: "center", background: "#11182766" }}>
            <Bot size={22} style={{ margin: "0 auto 10px", color: "#64748b" }} aria-hidden="true" />
            <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, color: "#94a3b8" }}>
              Primero conectá un modelo generativo en Modelos IA, armá el equipo en Equipo y volvé a Chat para hablar con el orquestador o cada agente.
            </p>
          </div>
        ) : chat.length === 0 ? (
          <div style={{ margin: "auto 0", border: "1px solid #1e293b", borderRadius: 8, padding: 14, background: "#111827" }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, color: "#94a3b8" }}>
              Tu equipo está listo. Escribí una instrucción, pregunta o misión corta. Podés dirigirla al orquestador, al equipo completo o a un agente especialista.
            </p>
          </div>
        ) : null}

        {chat.map((item) => (
          <article key={item.id} style={{ alignSelf: item.role === "user" ? "flex-end" : "stretch", maxWidth: item.role === "user" ? "88%" : "100%", border: `1px solid ${item.color}33`, borderLeft: `3px solid ${item.color}`, borderRadius: 8, background: item.role === "user" ? "#1f2937" : "#0f172a", padding: "8px 9px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              {item.role === "agent" ? <UsersRound size={12} color={item.color} aria-hidden="true" /> : null}
              <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 800, color: item.color }}>{item.speaker}</span>
              {item.target ? <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 9, color: "#64748b" }}>{item.target}</span> : null}
              <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 9, color: "#475569" }}>{item.timestamp}</span>
            </div>
            <p style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 11, lineHeight: 1.5, color: "#dbeafe" }}>{item.message}</p>
          </article>
        ))}

        {messages.length > 0 && chat.length === 0 ? (
          <div style={{ borderTop: "1px solid #1e293b", paddingTop: 8 }}>
            <div style={{ marginBottom: 6, fontFamily: "monospace", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 1 }}>Comms feed</div>
            {messages.slice(-4).map((msg) => (
              <div key={msg.id} style={{ marginBottom: 5, fontFamily: "monospace", fontSize: 10, color: "#64748b" }}>
                <span style={{ color: msg.fromColor }}>{msg.fromName}</span> {">"} {msg.toName}: {msg.message}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ padding: 10, borderTop: "1px solid #1e293b", background: "#050a12" }}>
        {error ? <p role="alert" style={{ margin: "0 0 8px", fontFamily: "monospace", fontSize: 10, color: "#fca5a5" }}>{error}</p> : null}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void sendMessage()
              }
            }}
            disabled={!canChat || sending}
            maxLength={3000}
            placeholder={canChat ? "Escribí al orquestador o agente..." : "Configurá Modelos IA > Equipo para habilitar chat"}
            style={{ flex: 1, minHeight: 44, maxHeight: 120, resize: "vertical", border: "1px solid #263449", borderRadius: 8, background: "#0a0f1a", color: "#e2e8f0", padding: "10px 11px", fontFamily: "monospace", fontSize: 11, lineHeight: 1.45, outline: "none" }}
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!canChat || !draft.trim() || sending}
            aria-label="Enviar mensaje al agente"
            title="Enviar mensaje"
            style={{ width: 44, height: 44, borderRadius: 8, border: "1px solid #22d3ee55", background: canChat && draft.trim() && !sending ? "#22d3ee22" : "#111827", color: canChat && draft.trim() && !sending ? "#67e8f9" : "#475569", display: "grid", placeItems: "center", cursor: canChat && draft.trim() && !sending ? "pointer" : "not-allowed" }}
          >
            {sending ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <Send size={16} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  )
}
