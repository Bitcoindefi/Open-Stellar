"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

interface RegistryAdminAgent {
  agentId: string
  name: string
  status: string
  xp: number
  tasksCompleted: number
  registeredAt: string
  lastSeen: string
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function statusTone(status: string): string {
  if (status === "active") return "bg-emerald-500/15 text-emerald-300 border-emerald-400/30"
  if (status === "working") return "bg-cyan-500/15 text-cyan-300 border-cyan-400/30"
  if (status === "idle") return "bg-amber-500/15 text-amber-300 border-amber-400/30"
  if (status === "offline") return "bg-slate-500/15 text-slate-300 border-slate-500/30"
  return "bg-rose-500/15 text-rose-300 border-rose-400/30"
}

export function AdminAgentsClient() {
  const [agents, setAgents] = useState<RegistryAdminAgent[]>([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  async function loadAgents(): Promise<void> {
    const response = await fetch("/api/registry", { cache: "no-store" })
    const data = await response.json() as { agents?: RegistryAdminAgent[] }
    setAgents(data.agents ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void loadAgents()
  }, [])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return agents.filter((agent) => {
      const matchesSearch =
        needle.length === 0 ||
        agent.name.toLowerCase().includes(needle) ||
        agent.agentId.toLowerCase().includes(needle) ||
        agent.status.toLowerCase().includes(needle)
      const matchesStatus = statusFilter === "all" || agent.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [agents, search, statusFilter])

  const visibleIds = filtered.map((agent) => agent.agentId)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))

  const toggleSelection = (agentId: string) => {
    setSelected((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    )
  }

  const toggleVisibleSelection = () => {
    setSelected((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.includes(id))
      }
      return Array.from(new Set([...current, ...visibleIds]))
    })
  }

  const forceOffline = async (agentId: string) => {
    setBusyId(agentId)
    await fetch(`/api/registry/${encodeURIComponent(agentId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "offline" }),
    })
    await loadAgents()
    setBusyId(null)
  }

  const deregister = async (agentId: string) => {
    setBusyId(agentId)
    await fetch(`/api/registry/${encodeURIComponent(agentId)}`, { method: "DELETE" })
    setSelected((current) => current.filter((id) => id !== agentId))
    await loadAgents()
    setBusyId(null)
  }

  const bulkDeregister = async () => {
    setBulkBusy(true)
    const ids = [...selected]
    await Promise.all(ids.map((agentId) => fetch(`/api/registry/${encodeURIComponent(agentId)}`, { method: "DELETE" })))
    setSelected([])
    await loadAgents()
    setBulkBusy(false)
  }

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Link
          href="/admin"
          className="w-fit rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-cyan-200 transition hover:border-cyan-300/60"
        >
          Back to admin
        </Link>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/85 p-6 shadow-[0_24px_80px_rgba(2,8,23,0.45)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">Operations</p>
              <h1 className="mt-3 font-pixel text-3xl uppercase text-slate-100">Registry Agents</h1>
              <p className="mt-3 max-w-3xl font-mono text-sm leading-7 text-slate-400">
                Search, inspect, force offline, and deregister agents without leaving the admin console.
              </p>
            </div>
            <button
              type="button"
              onClick={bulkDeregister}
              disabled={selected.length === 0 || bulkBusy}
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 font-mono text-xs uppercase tracking-[0.18em] text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkBusy ? "Deregistering..." : `Bulk deregister (${selected.length})`}
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by agent name, id, or status"
              className="h-12 rounded-2xl border border-slate-700 bg-slate-900/90 px-4 font-mono text-sm text-slate-100 outline-none transition focus:border-cyan-400/50"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-700 bg-slate-900/90 px-4 font-mono text-sm text-slate-100 outline-none transition focus:border-cyan-400/50"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="working">Working</option>
              <option value="idle">Idle</option>
              <option value="offline">Offline</option>
              <option value="error">Error</option>
            </select>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/85 p-4 shadow-[0_24px_80px_rgba(2,8,23,0.45)] sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-slate-400">
              {filtered.length} of {agents.length} agents
            </p>
            <label className="flex items-center gap-2 font-mono text-xs text-slate-300">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleVisibleSelection}
                className="h-4 w-4 accent-cyan-400"
              />
              Select visible
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left">
                  {["", "Agent ID", "Name", "Status", "XP", "Tasks", "Registered", "Last seen", "Actions"].map((label) => (
                    <th key={label} className="border-b border-slate-800 px-3 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center font-mono text-sm text-slate-500">
                      Loading agents...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center font-mono text-sm text-slate-500">
                      No agents match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((agent) => (
                    <tr key={agent.agentId} className="align-top">
                      <td className="border-b border-slate-900 px-3 py-4">
                        <input
                          type="checkbox"
                          checked={selected.includes(agent.agentId)}
                          onChange={() => toggleSelection(agent.agentId)}
                          className="h-4 w-4 accent-cyan-400"
                        />
                      </td>
                      <td className="border-b border-slate-900 px-3 py-4 font-mono text-sm text-slate-100">
                        <Link href={`/agents/${encodeURIComponent(agent.agentId)}`} className="hover:text-cyan-300">
                          {agent.agentId}
                        </Link>
                      </td>
                      <td className="border-b border-slate-900 px-3 py-4 font-mono text-sm text-slate-300">{agent.name}</td>
                      <td className="border-b border-slate-900 px-3 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-xs uppercase tracking-[0.16em] ${statusTone(agent.status)}`}>
                          {agent.status}
                        </span>
                      </td>
                      <td className="border-b border-slate-900 px-3 py-4 font-mono text-sm text-slate-200">{agent.xp.toLocaleString("en-US")}</td>
                      <td className="border-b border-slate-900 px-3 py-4 font-mono text-sm text-slate-200">{agent.tasksCompleted.toLocaleString("en-US")}</td>
                      <td className="border-b border-slate-900 px-3 py-4 font-mono text-sm text-slate-400">{formatDateTime(agent.registeredAt)}</td>
                      <td className="border-b border-slate-900 px-3 py-4 font-mono text-sm text-slate-400">{formatDateTime(agent.lastSeen)}</td>
                      <td className="border-b border-slate-900 px-3 py-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => forceOffline(agent.agentId)}
                            disabled={busyId === agent.agentId || bulkBusy}
                            className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Force offline
                          </button>
                          <button
                            type="button"
                            onClick={() => deregister(agent.agentId)}
                            disabled={busyId === agent.agentId || bulkBusy}
                            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Deregister
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
