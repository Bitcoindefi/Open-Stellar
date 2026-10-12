"use client"

import { useState } from "react"
import { Check, CircleAlert, Copy, Laptop, RefreshCw, ShieldCheck, Unplug } from "lucide-react"
import { toast } from "sonner"
import { useRunner } from "@/components/runner/use-runner"
import { RUNNER_COMMAND, RUNNER_DEFAULT_PORT } from "@/lib/runner/pairing"
import { agentChip, type AgentChip } from "@/lib/runner/events"
import type { RunnerAgent, RunnerStatus } from "@/lib/runner/client"

const chipTone: Record<AgentChip["tone"], string> = {
  ok: "bg-emerald-300/10 text-emerald-200",
  warn: "bg-amber-300/10 text-amber-200",
  off: "bg-slate-800 text-slate-500",
  info: "bg-cyan-300/10 text-cyan-200",
}

function statusText(status: RunnerStatus, paired: boolean, port: number): string {
  switch (status.state) {
    case "unpaired":
      return "Corrélo en una terminal y abrí el link de vinculación que te muestra. Se vincula una vez por sesión."
    case "checking":
      return "Buscando tu PC…"
    case "offline":
      return paired
        ? `No encontramos el runner en 127.0.0.1:${port}. ¿Lo cerraste? Volvé a correr el comando.`
        : `No encontramos el runner en 127.0.0.1:${port}. Corré el comando y probá de nuevo.`
    case "unauthorized":
      return paired
        ? "El runner se reinició y cambió la clave. Abrí el link nuevo que muestra la terminal."
        : "Encontramos el runner. Falta vincular: abrí el link que muestra la terminal."
    case "error":
      return status.message
    case "ready":
      return ""
  }
}

function AgentRow({ agent }: { agent: RunnerAgent }) {
  const chip = agentChip(agent)
  const hint = agent.installed && agent.loggedIn === false ? (agent.detail || (agent.loginHint ? `Corré ${agent.loginHint}` : "")) : ""
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-[#050a12] px-3 py-2">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-slate-100">{agent.label}</p>
        <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{agent.version ? `v${agent.version}` : "sin detectar"}{hint ? ` · ${hint}` : ""}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider ${chipTone[chip.tone]}`}>{chip.text}</span>
    </li>
  )
}

/** "Conectá tu PC": run the local runner and use the AI CLIs you are already logged into. */
export function RunnerCard({ compact = false }: { compact?: boolean }) {
  const runner = useRunner({ poll: true })
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const paired = Boolean(runner.pairing)
  const port = runner.pairing?.port ?? RUNNER_DEFAULT_PORT
  const status = runner.status

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(RUNNER_COMMAND)
      setCopied(true)
      toast.success("Comando copiado")
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("No se pudo copiar. Seleccioná el comando y copialo a mano.")
    }
  }

  const check = async (probe: boolean) => {
    setBusy(true)
    try {
      await runner.refresh({ probe, detect: true })
    } finally {
      setBusy(false)
    }
  }

  const box = compact ? "rounded-lg border border-slate-800 bg-[#080e18]/95 p-3" : "rounded-[26px] border border-slate-800 bg-[#080e18]/95 p-5 sm:p-6"
  const message = statusText(status, paired, port)

  return (
    <div className={box} data-testid="runner-card">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-2.5 text-cyan-200"><Laptop className="h-4 w-4" /></div>
        <div>
          <p className="text-[9px] uppercase tracking-[.28em] text-slate-500">Con tus logins de siempre</p>
          <h3 className="mt-1 font-pixel text-sm uppercase text-slate-100">Conectá tu PC</h3>
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-5 text-slate-400">
        Usá Claude Code, Codex, Gemini CLI u Ollama con la sesión que ya tenés en tu compu. Las tareas corren en tu PC y Agentic City solo las coordina.
      </p>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-800 bg-[#050a12] p-2 pl-3">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-cyan-100">{RUNNER_COMMAND}</code>
        <button type="button" onClick={() => void copy()} aria-label="Copiar comando" title="Copiar comando" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 text-cyan-100 transition hover:bg-cyan-300/10">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      {status.state === "ready" ? (
        <div className="mt-3 space-y-2">
          <p className="flex items-center gap-2 text-[11px] text-emerald-200"><Check className="h-3.5 w-3.5" /> Tu PC está conectada{status.version ? ` · runner v${status.version}` : ""}</p>
          <ul className="space-y-1.5" aria-label="Agentes detectados en tu PC">
            {status.agents.map((agent) => <AgentRow key={agent.id} agent={agent} />)}
          </ul>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => void check(true)} disabled={busy} className={secondaryButton}><RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Actualizar</button>
            <button type="button" onClick={() => runner.unpair()} className={secondaryButton}><Unplug className="h-3.5 w-3.5" /> Desvincular</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p role="status" className="flex items-start gap-2 text-xs leading-5 text-cyan-100">
            {status.state === "checking" ? <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" /> : <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            {message}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void check(false)} disabled={busy || status.state === "checking"} className={secondaryButton}>
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> {paired ? "Reintentar" : "Ya lo abrí, detectar"}
            </button>
            {paired ? <button type="button" onClick={() => runner.unpair()} className={secondaryButton}><Unplug className="h-3.5 w-3.5" /> Desvincular</button> : null}
          </div>
        </div>
      )}

      <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Solo escucha en 127.0.0.1, corre en modo lectura dentro de una carpeta temporal y nunca lee tus credenciales.
      </p>
    </div>
  )
}

const secondaryButton = "inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-1.5 text-[10px] uppercase tracking-[.14em] text-slate-300 transition hover:border-slate-500 disabled:cursor-wait disabled:opacity-40"
