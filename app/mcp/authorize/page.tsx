import { redirect } from "next/navigation"
import { readAgentWallet } from "@/lib/agent-wallet/cookie"
import { ConsentForm } from "@/components/mcp/consent-form"
import { GRANT_CAP_CHOICES, SCOPE_LABELS, defaultGrantCapMicro, publicOrigin } from "@/lib/mcp/config"
import { checkAuthorizeRequest } from "@/lib/mcp/oauth"
import { pageRequest } from "@/lib/mcp/page-request"
import { microToUsdc, readCaps, usdcToMicro } from "@/lib/orchestration/budget"
import { getKvStore } from "@/lib/security/kv-store"
import { AGENT_TASK_PRICE } from "@/lib/solana/payment-constants"

export const dynamic = "force-dynamic"
export const metadata = { title: "Conectar cliente MCP", robots: { index: false } }

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

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

// The OAuth consent screen an MCP client (Claude Code, Cursor, Claude Desktop) opens in the
// browser. The visitor's cookies identify them and their agents' wallet; no account is needed.
export default async function AuthorizePage({ searchParams }: PageProps) {
  const raw = await searchParams
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string") params.set(key, value)

  const req = await pageRequest("/mcp/authorize")
  const origin = publicOrigin(req.url)
  let check: Awaited<ReturnType<typeof checkAuthorizeRequest>>
  try {
    check = await checkAuthorizeRequest(getKvStore(), params, origin)
  } catch {
    return <Shell><h1 className="mt-2 text-lg font-semibold text-slate-100">No pudimos abrir el pedido</h1><p className="mt-3 text-sm text-slate-400">El almacenamiento no responde en este momento. Volvé a intentar desde tu cliente MCP.</p></Shell>
  }
  if (!check.ok) {
    if (check.redirect) redirect(check.redirect)
    return <Shell><h1 className="mt-2 text-lg font-semibold text-slate-100">Pedido no válido</h1><p className="mt-3 text-sm text-slate-400">{check.description}</p></Shell>
  }

  const { request, client } = check
  const caps = readCaps()
  const defaultCap = microToUsdc(defaultGrantCapMicro())
  const choices = GRANT_CAP_CHOICES.filter((choice) => (usdcToMicro(choice) ?? 0) <= caps.perDayMicro)
  const wallet = readAgentWallet(req)?.record.address ?? null
  const price = microToUsdc(usdcToMicro(AGENT_TASK_PRICE) ?? 10_000)

  return (
    <Shell>
      <h1 className="mt-2 text-lg font-semibold text-slate-100">¿Conectar <span className="text-cyan-200">{client.client_name}</span> a tus agentes?</h1>
      <p className="mt-2 text-xs text-slate-500">Nombre declarado por el propio cliente, no verificado. Vuelve a: <span className="font-mono text-slate-400">{new URL(request.redirectUri).host || request.redirectUri.split(":")[0]}</span></p>
      <h2 className="mt-5 text-[10px] uppercase tracking-[.2em] text-slate-400">Va a poder</h2>
      <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
        {request.scopes.map((scope) => <li key={scope}>· {SCOPE_LABELS[scope]}</li>)}
      </ul>
      <p className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100">
        Cada contratación cuesta {price} USDC (Solana devnet) y la paga la wallet de tus agentes{wallet ? <> (<span className="font-mono">{wallet.slice(0, 4)}…{wallet.slice(-4)}</span>)</> : " (la creamos ahora en este navegador)"}.
        Para que el cliente pueda pagar sin tu navegador, guardamos una copia cifrada de la clave de esa wallet atada a esta conexión; se borra cuando la desconectás.
      </p>
      <ConsentForm
        fields={{
          client_id: request.clientId,
          redirect_uri: request.redirectUri,
          response_type: "code",
          code_challenge: request.codeChallenge,
          code_challenge_method: "S256",
          state: request.state ?? "",
          scope: request.scopes.join(" "),
          resource: request.resource,
        }}
        capChoices={choices.length > 0 ? [...choices] : [defaultCap]}
        defaultCap={defaultCap}
        browserCapUsdc={microToUsdc(caps.perDayMicro)}
      />
    </Shell>
  )
}
