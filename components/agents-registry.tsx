"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export function AgentsRegistry() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [q, setQ] = useState(searchParams.get("q") || "")
  const [capability, setCapability] = useState(searchParams.get("capability") || "")
  const [status, setStatus] = useState(searchParams.get("status") || "")
  const [tag, setTag] = useState(searchParams.get("tag") || "")

  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAgents = useCallback(async (query: string, cap: string, stat: string, t: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set("q", query)
      if (cap) params.set("capability", cap)
      if (stat) params.set("status", stat)
      if (t) params.set("tag", t)

      const res = await fetch(`/api/agents?${params.toString()}`)
      const data = await res.json()
      if (data.ok) {
        setAgents(data.agents || [])
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [])

  // Sync state to URL and fetch
  useEffect(() => {
    const handler = setTimeout(() => {
      const params = new URLSearchParams()
      if (q) params.set("q", q)
      if (capability) params.set("capability", capability)
      if (status) params.set("status", status)
      if (tag) params.set("tag", tag)

      // Replace URL without full page reload
      router.replace(`?${params.toString()}`, { scroll: false })
      fetchAgents(q, capability, status, tag)
    }, 200)

    return () => clearTimeout(handler)
  }, [q, capability, status, tag, fetchAgents, router])

  const toggleFilter = (setter: any, currentVal: string, newVal: string) => {
    if (currentVal === newVal) setter("")
    else setter(newVal)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 font-mono text-3xl font-bold uppercase text-cyan-100">Agent Registry</h1>
      
      <div className="mb-8 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-4 py-2 font-mono text-sm text-slate-200 outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-400">Capabilities:</span>
            {["payment", "search", "data-indexing", "log-analysis", "task-routing"].map(c => (
              <Badge
                key={c}
                variant="outline"
                className={`cursor-pointer px-2 py-1 text-xs transition-colors ${capability === c ? 'bg-cyan-900/40 text-cyan-300 border-cyan-800' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                onClick={() => toggleFilter(setCapability, capability, c)}
              >
                {c}
              </Badge>
            ))}
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-400">Status:</span>
            {["active", "offline"].map(s => (
              <Badge
                key={s}
                variant="outline"
                className={`cursor-pointer px-2 py-1 text-xs transition-colors ${status === s ? 'bg-emerald-900/40 text-emerald-300 border-emerald-800' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                onClick={() => toggleFilter(setStatus, status, s)}
              >
                {s}
              </Badge>
            ))}
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-400">Tags:</span>
            {["finance", "v1", "v2"].map(t => (
              <Badge
                key={t}
                variant="outline"
                className={`cursor-pointer px-2 py-1 text-xs transition-colors ${tag === t ? 'bg-purple-900/40 text-purple-300 border-purple-800' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                onClick={() => toggleFilter(setTag, tag, t)}
              >
                {t}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center font-mono text-sm text-slate-500">Loading agents...</div>
      ) : (
        <div className="grid gap-4">
          {agents.length === 0 ? (
            <div className="text-center font-mono text-sm text-slate-500">No agents found matching criteria.</div>
          ) : (
            agents.map(agent => (
              <div key={agent.agentId} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700">
                <div>
                  <h3 className="font-mono text-lg font-bold text-slate-200">{agent.name || agent.agentId}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {agent.capabilities?.map((cap: string) => (
                      <span key={cap} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">{cap}</span>
                    ))}
                    {agent.tags?.map((t: string) => (
                      <span key={t} className="rounded bg-purple-900/20 px-2 py-0.5 font-mono text-[10px] text-purple-300">#{t}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`font-mono text-xs font-bold uppercase ${agent.status === 'offline' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {agent.status}
                  </span>
                  <Link
                    href={`/agents/${encodeURIComponent(agent.agentId)}`}
                    className="rounded border border-cyan-800 bg-cyan-950/30 px-3 py-1 font-mono text-xs text-cyan-400 transition-colors hover:bg-cyan-900/50"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
