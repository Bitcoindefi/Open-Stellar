"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, Check, CircleAlert, PlugZap, Plus, Save, Server, ShieldCheck, Trash2, X } from "lucide-react"
import { AccountConnections, useAccount } from "@/components/account/account-connections"

const STORAGE_KEY = "agentic-city:connections:v1"
const UPDATED_EVENT = "agentic-city:connections-updated"

const providers = [
  { id: "vercel-ai-gateway", name: "Vercel AI Gateway", hint: "typesafe-ai/jev", detail: "Una key propia para JEV y modelos del Gateway." },
  { id: "openai", name: "OpenAI", hint: "gpt-…", detail: "Modelos directos de OpenAI." },
  { id: "anthropic", name: "Anthropic", hint: "claude-…", detail: "Claude Messages API." },
  { id: "groq", name: "Groq", hint: "llama-…", detail: "API compatible con OpenAI." },
  { id: "openrouter", name: "OpenRouter", hint: "provider/model", detail: "Modelos de varios proveedores en una API." },
] as const

const connectorTypes = [
  { id: "github", name: "GitHub", hint: "Fine-grained personal access token", placeholder: "github_pat_…" },
  { id: "slack", name: "Slack", hint: "Bot User OAuth Token", placeholder: "xoxb-…" },
  { id: "discord", name: "Discord", hint: "Bot token", placeholder: "Discord bot token" },
] as const

type ProviderId = (typeof providers)[number]["id"]
type ConnectorId = (typeof connectorTypes)[number]["id"]
// auth "oauth": the key lives server-side in an encrypted cookie; the browser keeps only the model choice.
type ProviderConnection = { id: string; provider: ProviderId; name: string; model: string; apiKey: string; updatedAt: string; auth?: "oauth" }
type ConnectorConnection = { id: string; connector: ConnectorId; name: string; apiKey: string; updatedAt: string }
type TeamMember = { id: string; name: string; role: string; connectionId: string }
type TeamConfig = { name: string; orchestratorId: string; members: TeamMember[] }
type TeamResult = { memberId: string; name: string; role: string; model: string; status: string; assigned?: string[]; output?: string; error?: string }
type TeamRun = { orchestrator: string; plan: Array<{ memberId: string; title: string; instructions: string }>; results: TeamResult[] }
type SavedConnections = { providers: ProviderConnection[]; connectors: ConnectorConnection[]; team: TeamConfig | null }
type TestState = { id: string; status: "checking" | "ok" | "error"; message: string }

const emptyConnections: SavedConnections = { providers: [], connectors: [], team: null }

function readConnections(): SavedConnections {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<SavedConnections>
    return {
      providers: Array.isArray(parsed.providers) ? parsed.providers : [],
      connectors: Array.isArray(parsed.connectors) ? parsed.connectors : [],
      team: parsed.team && typeof parsed.team === "object" ? parsed.team : null,
    }
  } catch {
    return emptyConnections
  }
}

function writeConnections(value: SavedConnections) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  window.dispatchEvent(new Event(UPDATED_EVENT))
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const OPENROUTER_FAMILIES = ["anthropic/", "openai/", "x-ai/", "google/"]

export function ConnectionsPanel({
  compact = false,
  initialSection = "models",
  allowApiKeys = false,
}: {
  compact?: boolean
  initialSection?: "models" | "team" | "connectors"
  /** Paste-your-key forms are for operators only; the public UI connects by login. */
  allowApiKeys?: boolean
}) {
  const { account } = useAccount()
  const [orName, setOrName] = useState("")
  const [orModel, setOrModel] = useState("")
  const [orCatalog, setOrCatalog] = useState<string[]>([])
  const [connections, setConnections] = useState<SavedConnections>(emptyConnections)
  const [section, setSection] = useState<"models" | "team" | "connectors">(initialSection)
  const [provider, setProvider] = useState<ProviderId>("vercel-ai-gateway")
  const [providerName, setProviderName] = useState("")
  const [model, setModel] = useState("typesafe-ai/jev")
  const [modelKey, setModelKey] = useState("")
  const [connector, setConnector] = useState<ConnectorId>("github")
  const [connectorName, setConnectorName] = useState("")
  const [connectorKey, setConnectorKey] = useState("")
  const [teamName, setTeamName] = useState("Research squad")
  const [orchestratorId, setOrchestratorId] = useState("")
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([{ id: "worker-1", name: "Researcher", role: "Research and report evidence", connectionId: "" }])
  const [mission, setMission] = useState("")
  const [teamRun, setTeamRun] = useState<TeamRun | null>(null)
  const [running, setRunning] = useState(false)
  const [testStates, setTestStates] = useState<Record<string, TestState>>({})
  const [notice, setNotice] = useState("")

  useEffect(() => {
    const saved = readConnections()
    setConnections(saved)
    if (saved.team) {
      setTeamName(saved.team.name)
      setOrchestratorId(saved.team.orchestratorId)
      setTeamMembers(saved.team.members)
    }
  }, [])

  const selectedProvider = useMemo(() => providers.find((item) => item.id === provider)!, [provider])
  const selectedConnector = useMemo(() => connectorTypes.find((item) => item.id === connector)!, [connector])
  const generativeModels = connections.providers.filter((item) => !/\bjev$/i.test(item.model))

  const saveProvider = () => {
    const name = providerName.trim() || selectedProvider.name
    if (!model.trim() || !modelKey.trim()) {
      setNotice("Ingresá el ID del modelo y su API key para guardar la conexión.")
      return
    }
    const next = { ...connections, providers: [{ id: makeId(), provider, name, model: model.trim(), apiKey: modelKey.trim(), updatedAt: new Date().toISOString() }, ...connections.providers] }
    setConnections(next)
    writeConnections(next)
    setModelKey("")
    setProviderName("")
    setNotice(`${name} quedó guardado en este navegador. Probá la conexión antes de usarla.`)
  }

  useEffect(() => {
    if (!account.openrouter.connected || orCatalog.length > 0) return
    let active = true
    fetch("https://openrouter.ai/api/v1/models", { cache: "force-cache" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { data?: Array<{ id?: string }> } | null) => {
        if (!active || !data?.data) return
        setOrCatalog(data.data.map((item) => item.id ?? "").filter((id) => OPENROUTER_FAMILIES.some((prefix) => id.startsWith(prefix))).slice(0, 80))
      })
      .catch(() => {})
    return () => { active = false }
  }, [account.openrouter.connected, orCatalog.length])

  const saveOpenRouterModel = () => {
    if (!account.openrouter.connected) {
      setNotice("Conectá OpenRouter primero.")
      return
    }
    if (!orModel.trim()) {
      setNotice("Elegí un modelo de OpenRouter.")
      return
    }
    const name = orName.trim() || orModel.trim().split("/").pop() || "OpenRouter"
    const next = { ...connections, providers: [{ id: makeId(), provider: "openrouter" as ProviderId, name, model: orModel.trim(), apiKey: "", auth: "oauth" as const, updatedAt: new Date().toISOString() }, ...connections.providers] }
    setConnections(next)
    writeConnections(next)
    setOrModel("")
    setOrName("")
    setNotice(`${name} quedó listo. Usa tu cuenta de OpenRouter, sin keys guardadas en el navegador.`)
  }

  const saveConnector = () => {
    const name = connectorName.trim() || selectedConnector.name
    if (!connectorKey.trim()) {
      setNotice("Ingresá el token del conector para guardarlo.")
      return
    }
    const next = { ...connections, connectors: [{ id: makeId(), connector, name, apiKey: connectorKey.trim(), updatedAt: new Date().toISOString() }, ...connections.connectors] }
    setConnections(next)
    writeConnections(next)
    setConnectorKey("")
    setConnectorName("")
    setNotice(`${name} quedó guardado en este navegador. Probá la conexión antes de usarla.`)
  }

  const removeConnection = (kind: "model" | "connector", id: string) => {
    const next = kind === "model"
      ? { ...connections, providers: connections.providers.filter((item) => item.id !== id) }
      : { ...connections, connectors: connections.connectors.filter((item) => item.id !== id) }
    setConnections(next)
    writeConnections(next)
    setTestStates((states) => { const updated = { ...states }; delete updated[id]; return updated })
    setNotice("Conexión eliminada de este navegador.")
  }

  const testConnection = async (kind: "model" | "connector", item: ProviderConnection | ConnectorConnection) => {
    const id = item.id
    setTestStates((states) => ({ ...states, [id]: { id, status: "checking", message: "Probando credenciales…" } }))
    try {
      const body = kind === "model"
        ? { kind, provider: (item as ProviderConnection).provider, model: (item as ProviderConnection).model, apiKey: item.apiKey, auth: (item as ProviderConnection).auth }
        : { kind, connector: (item as ConnectorConnection).connector, apiKey: item.apiKey }
      const result = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
      })
      const data = await result.json().catch(() => ({})) as { ok?: boolean; error?: string; modelAvailable?: boolean }
      if (!result.ok || !data.ok) throw new Error(data.error || "No se pudo conectar.")
      const message = kind === "model" && data.modelAvailable === false
        ? "La key funciona, pero el proveedor no devolvió ese ID de modelo. Revisalo antes de asignarlo."
        : "Conexión verificada. La credencial no se guardó en el servidor."
      setTestStates((states) => ({ ...states, [id]: { id, status: data.modelAvailable === false ? "error" : "ok", message } }))
    } catch (error) {
      setTestStates((states) => ({ ...states, [id]: { id, status: "error", message: error instanceof Error ? error.message : "Falló la verificación." } }))
    }
  }

  const saveTeam = () => {
    if (!teamName.trim() || !generativeModels.some((item) => item.id === orchestratorId)) {
      setNotice("Elegí un nombre de equipo y un modelo generativo para el orquestador.")
      return
    }
    if (teamMembers.length < 1 || teamMembers.some((member) => !member.name.trim() || !member.role.trim() || !generativeModels.some((item) => item.id === member.connectionId))) {
      setNotice("Cada agente necesita nombre, rol y un modelo generativo conectado.")
      return
    }
    const team = { name: teamName.trim(), orchestratorId, members: teamMembers.map((member) => ({ ...member, name: member.name.trim(), role: member.role.trim() })) }
    const next = { ...connections, team }
    setConnections(next)
    writeConnections(next)
    setNotice(`Equipo “${team.name}” guardado en este navegador.`)
  }

  const runTeamMission = async () => {
    const leader = generativeModels.find((item) => item.id === orchestratorId)
    const selectedMembers = teamMembers.map((member) => ({ member, connection: generativeModels.find((item) => item.id === member.connectionId) }))
    if (!leader || !mission.trim() || selectedMembers.some((entry) => !entry.connection)) {
      setNotice("Configurá un orquestador, al menos un agente con modelo, y describí la misión.")
      return
    }
    setRunning(true)
    setTeamRun(null)
    setNotice("El orquestador está dividiendo la misión y lanzando las tareas asignadas… Cada proveedor puede facturar su uso.")
    try {
      const response = await fetch("/api/connections/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          mission: mission.trim(),
          orchestrator: { name: leader.name, connection: { provider: leader.provider, model: leader.model, apiKey: leader.apiKey, auth: leader.auth } },
          members: selectedMembers.map(({ member, connection }) => ({
            id: member.id,
            name: member.name,
            role: member.role,
            connection: { provider: connection!.provider, model: connection!.model, apiKey: connection!.apiKey, auth: connection!.auth },
          })),
        }),
      })
      const data = await response.json().catch(() => ({})) as TeamRun & { ok?: boolean; error?: string }
      if (!response.ok || !data.ok) throw new Error(data.error || "No se pudo ejecutar el equipo.")
      setTeamRun(data)
      setNotice("Misión completada. Revisá el plan del orquestador y el resultado de cada agente abajo.")
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falló la ejecución del equipo.")
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className={compact ? "space-y-3" : "space-y-5"}>
      <header className={compact ? "overflow-hidden border-b border-slate-800 bg-[#0b1220]" : "overflow-hidden rounded-[28px] border border-cyan-400/20 bg-[#07101b]/95 shadow-[0_24px_80px_rgba(2,8,23,.5)]"}>
        <div className={compact ? "p-3" : "grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-end lg:p-7"}>
          <div className="max-w-3xl">
            <div className={compact ? "mb-2 inline-flex items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[9px] uppercase tracking-[.18em] text-cyan-200" : "mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] uppercase tracking-[.28em] text-cyan-200"}><PlugZap className="h-3.5 w-3.5" /> Integration bay</div>
            <h2 className={compact ? "font-pixel text-sm uppercase text-white" : "font-pixel text-xl uppercase text-white sm:text-2xl"}>Modelos y conectores</h2>
            <p className={compact ? "mt-2 text-xs leading-5 text-slate-400" : "mt-3 font-vt323 text-xl leading-7 text-slate-300"}>Conectá proveedores de IA, armá un equipo de agentes y ejecutá misiones. Cada credencial queda en el perfil de este navegador y viaja al servidor solo al probarla o lanzar una misión.</p>
          </div>
          {!compact ? <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-xs leading-5 text-amber-100/80 lg:max-w-sm">
            <p className="flex items-center gap-2 font-semibold uppercase tracking-[.16em] text-amber-200"><ShieldCheck className="h-4 w-4" /> BYOK privado</p>
            <p className="mt-2">Las keys no se guardan en Vercel ni se comparten con otros usuarios. Para ejecutar agentes con estas credenciales, el caller debe enviarlas en cada solicitud autenticada.</p>
          </div> : null}
        </div>
        <div className={compact ? "grid grid-cols-3 gap-1 border-t border-slate-800/80 p-2" : "flex flex-wrap gap-2 border-t border-slate-800/80 px-5 py-3 lg:px-7"}>
          <SectionButton compact={compact} active={section === "models"} onClick={() => { setSection("models"); setNotice("") }}>Modelos <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5">{connections.providers.length}</span></SectionButton>
          <SectionButton compact={compact} active={section === "team"} onClick={() => { setSection("team"); setNotice("") }}>Equipo</SectionButton>
          <SectionButton compact={compact} active={section === "connectors"} onClick={() => { setSection("connectors"); setNotice("") }}>Conectores <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5">{connections.connectors.length}</span></SectionButton>
        </div>
      </header>

      {notice ? <p role="status" className={compact ? "mx-3 rounded-lg border border-cyan-300/20 bg-cyan-300/[.06] px-3 py-2 font-mono text-[11px] leading-5 text-cyan-100" : "rounded-xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-3 font-mono text-xs text-cyan-100"}>{notice}</p> : null}

      {section === "models" ? (
        <div className={compact ? "grid gap-3 px-3 pb-3" : "grid gap-5 xl:grid-cols-[.85fr_1.15fr]"}>
          <div className={compact ? "space-y-3" : "space-y-5"}>
          <AccountConnections compact={compact} />
          <div className={compact ? "rounded-lg border border-slate-800 bg-[#080e18]/95 p-3" : "rounded-[26px] border border-slate-800 bg-[#080e18]/95 p-5 sm:p-6"}>
            <SectionHeading icon={<Server className="h-4 w-4" />} eyebrow="Con tu cuenta de OpenRouter" title="Agregar modelo" />
            {account.openrouter.connected ? <>
              <label className="mt-5 block space-y-2"><FieldLabel>Modelo</FieldLabel><input list="openrouter-models" value={orModel} onChange={(event) => setOrModel(event.target.value)} className={inputClass} placeholder="anthropic/…, openai/…, x-ai/…, google/…" autoComplete="off" /><datalist id="openrouter-models">{orCatalog.map((id) => <option key={id} value={id} />)}</datalist></label>
              <label className="mt-4 block space-y-2"><FieldLabel>Nombre para mostrar <span className="normal-case tracking-normal text-slate-600">(opcional)</span></FieldLabel><input value={orName} onChange={(event) => setOrName(event.target.value)} className={inputClass} placeholder="Investigador, Crítico…" /></label>
              <button type="button" onClick={saveOpenRouterModel} className={primaryButton}><Save className="h-4 w-4" /> Agregar modelo</button>
            </> : <p className="mt-4 text-xs leading-5 text-slate-400">Conectá OpenRouter en “Tu cuenta” para sumar Claude, GPT, Grok o Gemini sin pegar ninguna key.</p>}
          </div>
          {allowApiKeys ? <div className={compact ? "rounded-lg border border-slate-800 bg-[#080e18]/95 p-3" : "rounded-[26px] border border-slate-800 bg-[#080e18]/95 p-5 sm:p-6"}>
            <SectionHeading icon={<Server className="h-4 w-4" />} eyebrow="Solo operadores · bring your own key" title="Agregar modelo con key" />
            <label className="mt-5 block space-y-2"><FieldLabel>Proveedor</FieldLabel><select value={provider} onChange={(event) => { const value = event.target.value as ProviderId; setProvider(value); setModel(value === "vercel-ai-gateway" ? "typesafe-ai/jev" : "") }} className={inputClass}>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="block text-xs text-slate-500">{selectedProvider.detail}</span></label>
            <label className="mt-4 block space-y-2"><FieldLabel>Nombre para mostrar <span className="normal-case tracking-normal text-slate-600">(opcional)</span></FieldLabel><input value={providerName} onChange={(event) => setProviderName(event.target.value)} className={inputClass} placeholder={selectedProvider.name} /></label>
            <label className="mt-4 block space-y-2"><FieldLabel>Model ID</FieldLabel><input value={model} onChange={(event) => setModel(event.target.value)} className={inputClass} placeholder={selectedProvider.hint} autoComplete="off" /></label>
            <label className="mt-4 block space-y-2"><FieldLabel>API key</FieldLabel><input value={modelKey} onChange={(event) => setModelKey(event.target.value)} className={inputClass} placeholder="Pegá la key de este proveedor" type="password" autoComplete="new-password" /></label>
            <button type="button" onClick={saveProvider} className={primaryButton}><Save className="h-4 w-4" /> Guardar conexión</button>
            <p className="mt-4 text-[11px] leading-5 text-slate-500">Vercel AI Gateway acepta IDs como <span className="font-mono text-slate-300">typesafe-ai/jev</span> o <span className="font-mono text-slate-300">openai/modelo</span>. Otros proveedores usan su ID nativo.</p>
          </div> : null}
          </div>

          <div className={compact ? "rounded-lg border border-slate-800 bg-[#080e18]/95 p-3" : "rounded-[26px] border border-slate-800 bg-[#080e18]/95 p-5 sm:p-6"}>
            <SectionHeading icon={<Activity className="h-4 w-4" />} eyebrow="Saved in this browser" title="Modelos conectados" />
            {connections.providers.length === 0 ? <EmptyState text="Todavía no hay modelos. Conectá OpenRouter y agregá uno para empezar." /> : <div className="mt-5 space-y-3">{connections.providers.map((item) => {
              const status = testStates[item.id]
              const providerInfo = providers.find((entry) => entry.id === item.provider)
              return <ConnectionCard key={item.id} title={item.name} subtitle={`${providerInfo?.name ?? item.provider}${item.auth === "oauth" ? " (login)" : ""} · ${item.model}`} status={status} onTest={() => void testConnection("model", item)} onRemove={() => removeConnection("model", item.id)} />
            })}</div>}
          </div>
        </div>
      ) : section === "team" ? (
        <div className={compact ? "space-y-3 px-3 pb-3" : "space-y-5"}>
          {generativeModels.length === 0 ? <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-5 text-sm text-amber-100"><p className="font-semibold">Primero conectá al menos un modelo generativo.</p><p className="mt-1 text-amber-100/70">Los modelos de evaluación JEV no reemplazan un modelo conversacional para repartir y ejecutar tareas.</p><button type="button" onClick={() => setSection("models")} className="mt-3 rounded-lg border border-amber-200/30 px-3 py-2 text-xs uppercase tracking-wider">Ir al paso 1 · Modelos</button></div> : null}
          <div className={compact ? "grid gap-3" : "grid gap-5 xl:grid-cols-[.85fr_1.15fr]"}>
            <div className={compact ? "space-y-3" : "space-y-5"}>
              <div className={compact ? "rounded-lg border border-slate-800 bg-[#080e18]/95 p-3" : "rounded-[26px] border border-slate-800 bg-[#080e18]/95 p-5 sm:p-6"}>
                <SectionHeading icon={<Activity className="h-4 w-4" />} eyebrow="Step 2 · Define roles" title="Armar el equipo" />
                <label className="mt-5 block space-y-2"><FieldLabel>Nombre del equipo</FieldLabel><input value={teamName} onChange={(event) => setTeamName(event.target.value)} className={inputClass} placeholder="Research squad" /></label>
                <label className="mt-4 block space-y-2"><FieldLabel>Agente orquestador · planifica y distribuye</FieldLabel><ModelSelect value={orchestratorId} onChange={setOrchestratorId} items={generativeModels} /></label>
                <div className="mt-6 flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[.2em] text-slate-400">Agentes especialistas</p><p className="mt-1 text-xs text-slate-600">Elegí un modelo por agente.</p></div><button type="button" disabled={teamMembers.length >= 5} onClick={() => setTeamMembers((items) => [...items, { id: makeId(), name: `Agent ${items.length + 1}`, role: "Analyze an assigned part of the mission", connectionId: "" }])} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/20 px-3 py-2 text-[10px] uppercase tracking-wider text-cyan-100 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Agregar</button></div>
                <div className="mt-3 space-y-3">{teamMembers.map((member, index) => <div key={member.id} className="rounded-xl border border-slate-800 bg-[#050a12] p-3"><div className="mb-3 flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[.16em] text-cyan-200">Worker {String(index + 1).padStart(2, "0")}</span>{teamMembers.length > 1 ? <button type="button" aria-label={`Quitar ${member.name}`} onClick={() => setTeamMembers((items) => items.filter((item) => item.id !== member.id))} className="text-slate-600 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button> : null}</div><div className="grid gap-2 sm:grid-cols-2"><input aria-label="Nombre del agente" value={member.name} onChange={(event) => setTeamMembers((items) => items.map((item) => item.id === member.id ? { ...item, name: event.target.value } : item))} className={inputClass} placeholder="Agent name" /><ModelSelect ariaLabel={`Modelo para ${member.name}`} value={member.connectionId} onChange={(connectionId) => setTeamMembers((items) => items.map((item) => item.id === member.id ? { ...item, connectionId } : item))} items={generativeModels} /></div><input aria-label="Rol del agente" value={member.role} onChange={(event) => setTeamMembers((items) => items.map((item) => item.id === member.id ? { ...item, role: event.target.value } : item))} className={`${inputClass} mt-2`} placeholder="Role and specialty" /></div>)}</div>
                <button type="button" onClick={saveTeam} className={primaryButton}><Save className="h-4 w-4" /> Guardar equipo</button>
              </div>
              <div className={compact ? "rounded-lg border border-emerald-300/15 bg-emerald-300/[.035] p-3" : "rounded-[26px] border border-emerald-300/15 bg-emerald-300/[.035] p-5 sm:p-6"}>
                <SectionHeading icon={<PlugZap className="h-4 w-4" />} eyebrow="Step 3 · Run a mission" title="Orquestar trabajo" />
                <label className="mt-5 block space-y-2"><FieldLabel>Objetivo y contexto</FieldLabel><textarea value={mission} onChange={(event) => setMission(event.target.value)} maxLength={3000} className={`${inputClass} min-h-32 resize-y leading-6`} placeholder="Ej.: investigá oportunidades de agentes de pagos en Stellar y Solana, compará riesgos y devolvé un plan priorizado…" /></label>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">Al ejecutar, las keys elegidas viajan al servidor por HTTPS solo para esta misión y se reenvían a sus proveedores. No quedan guardadas en Vercel. El uso puede tener costo en cada proveedor.</p>
                <button type="button" onClick={() => void runTeamMission()} disabled={running || generativeModels.length === 0} className={`${primaryButton} border-emerald-300/30 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15`}>{running ? <Activity className="h-4 w-4 animate-pulse" /> : <PlugZap className="h-4 w-4" />}{running ? "Equipo trabajando…" : "Lanzar misión"}</button>
              </div>
            </div>

            <div className={compact ? "rounded-lg border border-slate-800 bg-[#080e18]/95 p-3" : "rounded-[26px] border border-slate-800 bg-[#080e18]/95 p-5 sm:p-6"}>
              <SectionHeading icon={<Server className="h-4 w-4" />} eyebrow="Live orchestration" title="Registro de la misión" />
              {!teamRun ? <EmptyState text="Guardá tu equipo y lanzá una misión. El orquestador asigna tareas; cada worker responde usando su modelo configurado." /> : <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.04] p-4"><p className="text-[9px] uppercase tracking-[.24em] text-cyan-300">Plan · {teamRun.orchestrator}</p><div className="mt-3 space-y-2">{teamRun.plan.map((task, index) => <div key={`${task.memberId}-${index}`} className="rounded-lg border border-slate-800 bg-[#050a12] p-3"><p className="font-mono text-xs text-slate-200">{teamMembers.find((member) => member.id === task.memberId)?.name ?? task.memberId} · {task.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{task.instructions}</p></div>)}</div></div>
                {teamRun.results.map((result) => <article key={result.memberId} className="rounded-xl border border-slate-800 bg-[#050a12] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-pixel text-xs uppercase text-slate-100">{result.name}</h4><p className="mt-1 font-mono text-[10px] text-slate-500">{result.role} · {result.model}</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] uppercase tracking-wider ${result.status === "completed" ? "bg-emerald-300/10 text-emerald-200" : result.status === "failed" ? "bg-rose-300/10 text-rose-200" : "bg-slate-800 text-slate-400"}`}>{result.status}</span></div>{result.assigned?.length ? <p className="mt-3 text-[10px] uppercase tracking-wider text-cyan-200">{result.assigned.join(" · ")}</p> : null}<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{result.output || result.error || "No output"}</p></article>)}
              </div>}
            </div>
          </div>
        </div>
      ) : (
        <div className={compact ? "grid gap-3 px-3 pb-3" : "grid gap-5 xl:grid-cols-[.85fr_1.15fr]"}>
          <div className={compact ? "rounded-lg border border-slate-800 bg-[#080e18]/95 p-3" : "rounded-[26px] border border-slate-800 bg-[#080e18]/95 p-5 sm:p-6"}>
            <SectionHeading icon={<PlugZap className="h-4 w-4" />} eyebrow="Tool connectors" title="Agregar complemento" />
            <label className="mt-5 block space-y-2"><FieldLabel>Servicio</FieldLabel><select value={connector} onChange={(event) => setConnector(event.target.value as ConnectorId)} className={inputClass}>{connectorTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="block text-xs text-slate-500">{selectedConnector.hint}</span></label>
            <label className="mt-4 block space-y-2"><FieldLabel>Nombre para mostrar <span className="normal-case tracking-normal text-slate-600">(opcional)</span></FieldLabel><input value={connectorName} onChange={(event) => setConnectorName(event.target.value)} className={inputClass} placeholder={selectedConnector.name} /></label>
            <label className="mt-4 block space-y-2"><FieldLabel>Token / API key</FieldLabel><input value={connectorKey} onChange={(event) => setConnectorKey(event.target.value)} className={inputClass} placeholder={selectedConnector.placeholder} type="password" autoComplete="new-password" /></label>
            <button type="button" onClick={saveConnector} className={primaryButton}><Plus className="h-4 w-4" /> Guardar complemento</button>
            <p className="mt-4 text-[11px] leading-5 text-slate-500">Al verificar, Agentic City consulta solamente el endpoint oficial de identidad/autenticación del servicio. No ejecuta acciones ni publica contenido. La ejecución de acciones por herramientas conectadas requiere una aprobación específica dentro de la misión.</p>
          </div>

          <div className={compact ? "rounded-lg border border-slate-800 bg-[#080e18]/95 p-3" : "rounded-[26px] border border-slate-800 bg-[#080e18]/95 p-5 sm:p-6"}>
            <SectionHeading icon={<Activity className="h-4 w-4" />} eyebrow="Saved in this browser" title="Complementos conectados" />
            {connections.connectors.length === 0 ? <EmptyState text="Todavía no hay complementos. Guardá GitHub, Slack o Discord para probar su token." /> : <div className="mt-5 space-y-3">{connections.connectors.map((item) => {
              const status = testStates[item.id]
              const connectorInfo = connectorTypes.find((entry) => entry.id === item.connector)
              return <ConnectionCard key={item.id} title={item.name} subtitle={`${connectorInfo?.name ?? item.connector} · token oculto`} status={status} onTest={() => void testConnection("connector", item)} onRemove={() => removeConnection("connector", item.id)} />
            })}</div>}
          </div>
        </div>
      )}
    </section>
  )
}

const inputClass = "w-full rounded-xl border border-slate-700/80 bg-[#050a12] px-3.5 py-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60"
const primaryButton = "mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[.16em] text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-300/15 focus:outline-none focus:ring-2 focus:ring-cyan-200/60"

function SectionButton({ active, onClick, children, compact = false }: { active: boolean; onClick: () => void; children: React.ReactNode; compact?: boolean }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-lg px-3 py-2 text-left uppercase transition ${compact ? "text-[9px] tracking-[.08em]" : "text-[10px] tracking-[.13em] sm:text-xs"} ${active ? "bg-cyan-300/10 text-cyan-100" : "text-slate-500 hover:bg-slate-800/70 hover:text-slate-200"}`}>{children}</button>
}

function SectionHeading({ icon, eyebrow, title }: { icon: React.ReactNode; eyebrow: string; title: string }) {
  return <div className="flex items-center gap-3"><div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-2.5 text-cyan-200">{icon}</div><div><p className="text-[9px] uppercase tracking-[.28em] text-slate-500">{eyebrow}</p><h3 className="mt-1 font-pixel text-sm uppercase text-slate-100">{title}</h3></div></div>
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="block text-[10px] font-semibold uppercase tracking-[.2em] text-slate-400">{children}</span>
}

function ModelSelect({ value, onChange, items, ariaLabel }: { value: string; onChange: (value: string) => void; items: ProviderConnection[]; ariaLabel?: string }) {
  return <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} disabled={items.length === 0} className={inputClass}>
    <option value="">{items.length ? "Seleccionar modelo conectado" : "Conectá primero un modelo"}</option>
    {items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.model}</option>)}
  </select>
}

function EmptyState({ text }: { text: string }) {
  return <div className="mt-5 flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 px-6 text-center"><span className="rounded-full border border-slate-700 bg-slate-900 p-3 text-slate-500"><PlugZap className="h-4 w-4" /></span><p className="mt-3 max-w-sm font-vt323 text-lg text-slate-400">{text}</p></div>
}

function ConnectionCard({ title, subtitle, status, onTest, onRemove }: { title: string; subtitle: string; status?: TestState; onTest: () => void; onRemove: () => void }) {
  return <article className="rounded-2xl border border-slate-800 bg-[#050a12] p-4">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><h4 className="truncate font-pixel text-xs uppercase text-slate-100">{title}</h4><p className="mt-2 break-all font-mono text-[11px] text-slate-500">{subtitle}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={onTest} disabled={status?.status === "checking"} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/20 px-3 py-2 text-[10px] uppercase tracking-[.12em] text-cyan-100 transition hover:bg-cyan-300/10 disabled:cursor-wait disabled:opacity-50">{status?.status === "checking" ? <Activity className="h-3.5 w-3.5 animate-pulse" /> : <Check className="h-3.5 w-3.5" />} Probar</button><button type="button" onClick={onRemove} aria-label={`Eliminar ${title}`} className="rounded-lg border border-rose-400/15 p-2 text-rose-300/70 transition hover:border-rose-300/40 hover:bg-rose-400/10 hover:text-rose-200"><Trash2 className="h-3.5 w-3.5" /></button></div></div>
    {status ? <p role="status" className={`mt-3 flex items-start gap-2 text-xs leading-5 ${status.status === "error" ? "text-rose-200" : status.status === "ok" ? "text-emerald-200" : "text-cyan-200"}`}>{status.status === "error" ? <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : status.status === "ok" ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-pulse" />}{status.message}</p> : null}
  </article>
}
