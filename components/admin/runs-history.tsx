"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Copy, ExternalLink, Play, RefreshCw } from "lucide-react"
import type { OrchestrationRun, RunListItem } from "@/lib/orchestration/runs"
import { formatDuration } from "@/lib/orchestration/runs"

type RunsPayload = {
  runs: RunListItem[]
  stats: {
    totalRuns: number
    completedRuns: number
    failedRuns: number
    totalCostXlm: string
  }
}

type RunDetailPayload = {
  ok: boolean
  run: OrchestrationRun
  rerunEstimate: {
    originalCostXlm: string
    estimatedCostXlm: string
    deltaXlm: string
  }
}

function relativeTime(iso: string) {
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function statusClasses(status: string) {
  if (status === "completed") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
  if (status === "failed") return "border-red-400/30 bg-red-400/10 text-red-300"
  if (status === "running") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
  return "border-slate-700 bg-slate-900 text-slate-400"
}

export function RunsHistory({ initialData }: { initialData: RunsPayload }) {
  const [runs, setRuns] = useState(initialData.runs)
  const [selected, setSelected] = useState<RunDetailPayload | null>(null)
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null)
  const [rerunMessage, setRerunMessage] = useState<string | null>(null)

  const stats = useMemo(() => ({
    ...initialData.stats,
    totalRuns: runs.length,
    runningRuns: runs.filter((run) => run.status === "running").length,
  }), [initialData.stats, runs])

  async function openRun(runId: string) {
    setLoadingRunId(runId)
    setRerunMessage(null)
    try {
      const response = await fetch(`/api/admin/runs/${encodeURIComponent(runId)}`, { cache: "no-store" })
      const data = await response.json()
      if (response.ok) setSelected(data)
    } finally {
      setLoadingRunId(null)
    }
  }

  async function rerun(runId: string) {
    setLoadingRunId(runId)
    setRerunMessage(null)
    try {
      const response = await fetch("/api/admin/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      })
      const data = await response.json()
      if (response.ok) {
        const item = {
          id: data.run.id,
          goal: data.run.goal,
          status: data.run.status,
          stepsCompleted: 0,
          stepsTotal: data.run.steps.length,
          durationMs: undefined,
          totalCostXlm: data.run.totalCostXlm,
          startedAt: data.run.startedAt,
        }
        setRuns((current) => [item, ...current])
        setSelected({ ok: true, run: data.run, rerunEstimate: data.estimate })
        setRerunMessage(`Queued ${data.run.id}; estimated cost ${data.estimate.estimatedCostXlm} XLM (${data.estimate.deltaXlm} delta).`)
      }
    } finally {
      setLoadingRunId(null)
    }
  }

  return (
    <main className="min-h-screen bg-[#04070d] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <header className="rounded-[28px] border border-cyan-500/20 bg-slate-950/80 p-5 shadow-[0_24px_80px_rgba(2,8,23,0.5)]">
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200">
            <ArrowLeft className="h-3.5 w-3.5" />
            Admin
          </Link>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-300">Execution audit trail</p>
              <h1 className="mt-3 font-pixel text-2xl uppercase text-cyan-100 sm:text-3xl">Orchestration Runs</h1>
              <p className="mt-3 max-w-3xl font-vt323 text-xl leading-7 text-slate-300">
                Review completed and failed multi-agent workflows, inspect every step payload, and queue a re-run with a cost delta before dispatch.
              </p>
            </div>
            {rerunMessage && (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3 font-mono text-xs text-emerald-200">
                {rerunMessage}
              </div>
            )}
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-5">
          <Stat label="Runs" value={String(stats.totalRuns)} />
          <Stat label="Completed" value={String(stats.completedRuns)} />
          <Stat label="Failed" value={String(stats.failedRuns)} />
          <Stat label="Running" value={String(stats.runningRuns)} />
          <Stat label="Cost" value={`${stats.totalCostXlm} XLM`} />
        </section>

        <section className="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950/80">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-900/90 text-[10px] uppercase tracking-[0.24em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Run ID</th>
                <th className="px-4 py-3">Goal</th>
                <th className="px-4 py-3">Steps</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Cost</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-slate-800 text-slate-200 transition hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-mono text-cyan-200">{run.id}</td>
                  <td className="max-w-[360px] px-4 py-3">{run.goal}</td>
                  <td className="px-4 py-3 font-mono">{run.stepsCompleted}/{run.stepsTotal}</td>
                  <td className="px-4 py-3 font-mono text-slate-400">{formatDuration(run.durationMs)}</td>
                  <td className="px-4 py-3 font-mono">{run.totalCostXlm} XLM</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${statusClasses(run.status)}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{relativeTime(run.startedAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openRun(run.id)}
                      className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-cyan-200"
                    >
                      {loadingRunId === run.id ? "Loading" : "Details"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {selected && (
          <section className="rounded-[28px] border border-cyan-500/20 bg-slate-950 p-5 shadow-[0_24px_80px_rgba(2,8,23,0.55)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Run detail</p>
                <h2 className="mt-2 font-pixel text-xl uppercase text-cyan-100">{selected.run.id}</h2>
                <p className="mt-2 max-w-3xl font-vt323 text-xl leading-7 text-slate-300">{selected.run.goal}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => rerun(selected.run.id)}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-emerald-200"
                >
                  <Play className="h-3.5 w-3.5" />
                  Re-run
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs uppercase tracking-[0.18em] text-slate-300"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Stat label="Original cost" value={`${selected.rerunEstimate.originalCostXlm} XLM`} />
              <Stat label="Re-run estimate" value={`${selected.rerunEstimate.estimatedCostXlm} XLM`} />
              <Stat label="Delta" value={`${selected.rerunEstimate.deltaXlm} XLM`} />
            </div>

            <div className="mt-5 grid gap-3">
              {selected.run.steps.map((step, index) => (
                <article key={step.id} className="rounded-[22px] border border-slate-800 bg-[#09101a] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[10px] text-slate-400">Step {index + 1}</span>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${statusClasses(step.status)}`}>{step.status}</span>
                        {step.dependsOn && <span className="font-mono text-[11px] text-slate-500">depends on {step.dependsOn}</span>}
                      </div>
                      <h3 className="mt-3 font-pixel text-sm uppercase text-slate-100">{step.task}</h3>
                      <p className="mt-2 font-mono text-xs text-cyan-200">{step.agentName} / {step.agentId}</p>
                    </div>
                    <div className="font-mono text-xs text-slate-400">
                      {formatDuration(step.durationMs)} / {step.costXlm ?? "-"} XLM
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    <JsonBlock title="Input" value={step.input} />
                    <JsonBlock title="Output" value={step.result ?? { status: "pending" }} />
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Logs</p>
                      <ul className="mt-2 space-y-1 font-mono text-xs text-slate-300">
                        {step.logs.map((line) => <li key={line}>{line}</li>)}
                      </ul>
                      {step.receiptId && (
                        <a href={`/explorer?q=${encodeURIComponent(step.receiptId)}`} className="mt-3 inline-flex items-center gap-2 text-xs text-cyan-300">
                          {step.receiptId}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-800 bg-slate-950/80 p-4">
      <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-xl text-cyan-200">{value}</div>
    </div>
  )
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{title}</p>
        <Copy className="h-3.5 w-3.5 text-slate-600" />
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-slate-300">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}
