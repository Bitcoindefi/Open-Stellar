"use client"

import { useEffect, useState } from "react"

// The Approve / Deny form of the MCP consent page. It also sends a snapshot of the team the
// person configured in this browser (ids, names and roles only, never model keys), so the MCP
// client hires the same agents the chat uses.

const CONNECTIONS_STORAGE_KEY = "agentic-city:connections:v1"

type TeamSnapshot = Array<{ id: string; name: string; role: string }>

function readTeam(): TeamSnapshot {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONNECTIONS_STORAGE_KEY) || "{}") as { team?: { members?: unknown } }
    const members = Array.isArray(parsed.team?.members) ? parsed.team.members : []
    return members.flatMap((member) => {
      if (!member || typeof member !== "object") return []
      const record = member as Record<string, unknown>
      if (typeof record.id !== "string" || typeof record.name !== "string") return []
      return [{ id: record.id, name: record.name, role: typeof record.role === "string" ? record.role : "" }]
    }).slice(0, 5)
  } catch {
    return []
  }
}

export function ConsentForm({ fields, capChoices, defaultCap, browserCapUsdc }: {
  fields: Record<string, string>
  capChoices: string[]
  defaultCap: string
  browserCapUsdc: string
}) {
  const [team, setTeam] = useState<TeamSnapshot>([])
  const [cap, setCap] = useState(capChoices.includes(defaultCap) ? defaultCap : capChoices[0])

  useEffect(() => {
    setTeam(readTeam())
  }, [])

  // No disabling on submit: a submit button disabled during the submit event is left out of the
  // form data, and a missing decision would read as a denial.
  return (
    <form method="post" action="/api/mcp/oauth/authorize" className="mt-5 space-y-4">
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <input type="hidden" name="team" value={JSON.stringify(team)} />
      <label className="block text-sm text-slate-300">
        Este cliente puede gastar hasta
        <select name="cap" value={cap} onChange={(event) => setCap(event.target.value)} className="mx-2 rounded-md border border-slate-700 bg-[#050a12] px-2 py-1 font-mono text-cyan-100">
          {capChoices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
        </select>
        USDC/día de la wallet de tus agentes.
      </label>
      <p className="text-[11px] leading-5 text-slate-500">
        Nunca más que el tope diario de tu wallet ({browserCapUsdc} USDC, compartido con el chat). Por encima del tope no se paga nada: te llega un enlace para aprobar cada contratación.
        {team.length > 0 ? ` Va a poder contratar a tu equipo: ${team.map((member) => member.name).join(", ")}.` : " Todavía no armaste un equipo: va a contratar al equipo por defecto (Investigadora, Analista, Redactor)."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="approve" className="inline-flex min-h-11 items-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-cyan-100 hover:bg-cyan-300/15 disabled:opacity-50">Aprobar</button>
        <button type="submit" name="decision" value="deny" className="inline-flex min-h-11 items-center rounded-xl border border-slate-600 px-5 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-slate-200 hover:bg-slate-800 disabled:opacity-50">Rechazar</button>
      </div>
      <p className="text-[10px] leading-4 text-slate-500">Podés desconectarlo cuando quieras en “Clientes MCP conectados” (pestaña Wallet, o /mcp).</p>
    </form>
  )
}
