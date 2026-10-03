"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Copy, Plug, Unplug } from "lucide-react"

// "Conectar Claude Code / Cursor" and "Clientes MCP conectados": how to point an MCP client at
// this server, and the clients this browser approved, each one revocable.

type ConnectedClient = { id: string; clientName: string; redirectHost: string; scopes: string[]; capUsdc: string; createdAt: string; lastRefreshAt: string }

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="mt-2">
      <p className="text-[10px] uppercase tracking-[.16em] text-slate-500">{label}</p>
      <div className="mt-1 flex items-start gap-2 rounded-lg border border-slate-800 bg-[#050a12] px-3 py-2">
        <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-[11px] leading-5 text-cyan-100">{value}</pre>
        <button type="button" onClick={() => void copy()} aria-label={`Copiar: ${label}`} className="shrink-0 text-slate-400 hover:text-cyan-100">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-200" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

export function McpClientsPanel() {
  const [origin, setOrigin] = useState("https://agentic-city.vercel.app")
  const [clients, setClients] = useState<ConnectedClient[] | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/mcp/grants", { cache: "no-store" })
      const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; clients?: ConnectedClient[] }
      if (!response.ok || !data.ok) throw new Error(data.error || "No pudimos leer los clientes conectados.")
      setClients(data.clients ?? [])
      setError("")
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No pudimos leer los clientes conectados.")
    }
  }, [])

  useEffect(() => {
    setOrigin(window.location.origin)
    void load()
  }, [load])

  const revoke = async (id: string) => {
    setBusy(id)
    try {
      const response = await fetch("/api/mcp/grants", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (!response.ok || !data.ok) throw new Error(data.error || "No pudimos desconectarlo.")
      await load()
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "No pudimos desconectarlo.")
    } finally {
      setBusy(null)
    }
  }

  const url = `${origin}/api/mcp`
  const cursor = JSON.stringify({ mcpServers: { "agentic-city": { url } } }, null, 2)

  return (
    <section className="rounded-lg border border-cyan-300/20 bg-cyan-300/[.035] p-3">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-2.5 text-cyan-200"><Plug className="h-4 w-4" /></div>
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[.28em] text-slate-500">MCP · sin API keys</p>
          <h3 className="mt-1 font-pixel text-sm uppercase text-slate-100">Conectar Claude Code / Cursor</h3>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-slate-400">
        Tu cliente MCP abre esta página para que apruebes la conexión (con las cookies de este navegador, sin cuenta). Después puede contratar a tus agentes pagando con la wallet de tus agentes, dentro del tope diario que elijas.
      </p>
      <CopyLine label="Claude Code" value={`claude mcp add --transport http agentic-city ${url}`} />
      <CopyLine label="Cursor (~/.cursor/mcp.json)" value={cursor} />
      <CopyLine label="Claude Desktop (Ajustes > Conectores > Agregar conector personalizado)" value={url} />

      <h4 className="mt-4 text-[10px] uppercase tracking-[.2em] text-slate-400">Clientes MCP conectados</h4>
      {clients === null && !error ? <p className="mt-2 text-xs text-slate-500">Cargando…</p> : null}
      {clients && clients.length === 0 ? <p className="mt-2 text-xs text-slate-500">Ninguno todavía.</p> : null}
      <ul className="mt-2 space-y-2">
        {(clients ?? []).map((client) => (
          <li key={client.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-[#050a12] px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-slate-100">{client.clientName}</p>
              <p className="truncate font-mono text-[10px] text-slate-500">{client.capUsdc} USDC/día · desde {new Date(client.createdAt).toLocaleDateString()} · {client.redirectHost}</p>
            </div>
            <button type="button" onClick={() => void revoke(client.id)} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/30 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-rose-200 disabled:opacity-50">
              <Unplug className="h-3 w-3" />{busy === client.id ? "…" : "Desconectar"}
            </button>
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="mt-2 text-xs text-rose-200">{error}</p> : null}
    </section>
  )
}
