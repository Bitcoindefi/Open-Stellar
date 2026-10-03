import { readBrowserId } from "@/lib/identity/browser-id"
import { getApproval } from "@/lib/mcp/approvals"
import { pageRequest } from "@/lib/mcp/page-request"
import { microToUsdc } from "@/lib/orchestration/budget"
import { getKvStore } from "@/lib/security/kv-store"

export const dynamic = "force-dynamic"
export const metadata = { title: "Aprobar contratación", robots: { index: false } }

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const RESULTS: Record<string, string> = {
  approved: "Aprobada. Volvé a tu cliente MCP: puede repetir la contratación con este mismo approvalId.",
  rejected: "Rechazada. No se pagó nada.",
  invalid: "Esta aprobación ya no está pendiente, venció o no es de este navegador.",
  "not-yours": "Abrí este enlace en el navegador donde conectaste el cliente MCP.",
  "cross-site": "La decisión tiene que tomarse desde esta página.",
  unavailable: "No pudimos guardar tu decisión ahora. Probá de nuevo.",
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#050a12] px-4 py-10 text-slate-200">
      <div className="mx-auto max-w-lg rounded-2xl border border-cyan-300/20 bg-cyan-300/[.035] p-6">
        <p className="text-[10px] uppercase tracking-[.28em] text-slate-500">Agentic City · MCP</p>
        {children}
      </div>
    </main>
  )
}

// An MCP client asked for a hire over its daily cap. Only the browser that approved that client
// (same ac_uid cookie) can approve or reject it here.
export default async function ApprovePage({ searchParams }: PageProps) {
  const params = await searchParams
  const id = typeof params.id === "string" ? params.id : ""
  const result = typeof params.result === "string" ? RESULTS[params.result] : undefined
  const req = await pageRequest("/mcp/approve")
  let approval: Awaited<ReturnType<typeof getApproval>> = null
  try {
    approval = await getApproval(getKvStore(), id)
  } catch {
    approval = null
  }
  const browser = readBrowserId(req)

  if (!approval) {
    return <Shell><h1 className="mt-2 text-lg font-semibold text-slate-100">Aprobación no encontrada</h1><p className="mt-3 text-sm text-slate-400">{result ?? "No existe o ya venció (duran 15 minutos). Pedile a tu cliente MCP que la solicite de nuevo."}</p></Shell>
  }
  if (!browser || browser.id !== approval.uid) {
    return <Shell><h1 className="mt-2 text-lg font-semibold text-slate-100">Este no es el navegador correcto</h1><p className="mt-3 text-sm text-slate-400">{RESULTS["not-yours"]}</p></Shell>
  }

  const cap = microToUsdc(approval.capMicro)
  return (
    <Shell>
      <h1 className="mt-2 text-lg font-semibold text-slate-100">{approval.clientName} quiere contratar a {approval.agentName}</h1>
      <p className="mt-2 text-sm text-slate-300">Costo: <span className="font-mono text-cyan-100">{microToUsdc(approval.amountMicro)} USDC</span> (Solana devnet), desde la wallet de tus agentes.</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        {approval.reason === "grant" ? `Supera el tope diario de este cliente (${cap} USDC).` : `Supera el tope diario de la wallet de tus agentes (${cap} USDC, compartido con el chat).`} Si aprobás, se paga solo esta contratación.
      </p>
      <blockquote className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-800 bg-[#050a12] p-3 text-xs leading-5 text-slate-300">{approval.taskPreview}</blockquote>
      {result ? <p role="status" className="mt-4 text-sm text-emerald-200">{result}</p> : null}
      {approval.status === "pending" ? (
        <form method="post" action="/api/mcp/approvals" className="mt-5 flex flex-wrap gap-2">
          <input type="hidden" name="id" value={approval.id} />
          <button type="submit" name="decision" value="approve" className="inline-flex min-h-11 items-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-cyan-100 hover:bg-cyan-300/15">Aprobar esta contratación</button>
          <button type="submit" name="decision" value="reject" className="inline-flex min-h-11 items-center rounded-xl border border-slate-600 px-5 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-slate-200 hover:bg-slate-800">Rechazar</button>
        </form>
      ) : !result ? <p className="mt-4 text-sm text-slate-400">{approval.status === "approved" ? RESULTS.approved : RESULTS.rejected}</p> : null}
    </Shell>
  )
}
