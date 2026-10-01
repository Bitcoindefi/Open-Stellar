"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { Check, CircleAlert, KeyRound, LogIn, LogOut, PlugZap, RefreshCw } from "lucide-react"
import { authClient } from "@/lib/auth/user-auth-client"

export const ACCOUNT_UPDATED_EVENT = "agentic-city:account-updated"

export type AccountState = {
  user: { name: string; email: string; image: string | null } | null
  google: { enabled: boolean }
  openrouter: { enabled: boolean; connected: boolean; connectedAt: string | null }
}

type Snapshot = { account: AccountState; status: "loading" | "ready" | "error" }

const emptyAccount: AccountState = { user: null, google: { enabled: false }, openrouter: { enabled: false, connected: false, connectedAt: null } }

// One shared fetch for every component that needs the account (panel, model form, chat).
let snapshot: Snapshot = { account: emptyAccount, status: "loading" }
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function publish(next: Snapshot) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

function refreshAccount(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const response = await fetch("/api/account", { cache: "no-store" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      publish({ account: await response.json() as AccountState, status: "ready" })
    } catch {
      // Keep what we knew; the UI offers a retry instead of showing a false "not available".
      publish({ account: snapshot.account, status: snapshot.status === "ready" ? "ready" : "error" })
    } finally {
      inflight = null
    }
  })()
  return inflight
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1 && snapshot.status !== "ready") void refreshAccount()
  const onUpdate = () => void refreshAccount()
  window.addEventListener(ACCOUNT_UPDATED_EVENT, onUpdate)
  return () => {
    listeners.delete(listener)
    window.removeEventListener(ACCOUNT_UPDATED_EVENT, onUpdate)
  }
}

export function useAccount() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
  const refresh = useCallback(() => refreshAccount(), [])
  return { account: state.account, loaded: state.status !== "loading", failed: state.status === "error", refresh }
}

function currentPath() {
  return typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`
}

export function AccountConnections({ compact = false }: { compact?: boolean }) {
  const { account, loaded, failed, refresh } = useAccount()
  const [busy, setBusy] = useState<"google" | "logout" | "openrouter" | null>(null)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get("openrouter")
    if (!status) return
    setNotice(status === "connected" ? "OpenRouter quedó conectado. Ya podés sumar modelos sin pegar ninguna key." : "No se pudo conectar OpenRouter. Probá de nuevo.")
    params.delete("openrouter")
    const query = params.toString()
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`)
    window.dispatchEvent(new Event(ACCOUNT_UPDATED_EVENT))
  }, [])

  const signIn = async () => {
    setBusy("google")
    setNotice("")
    try {
      await authClient.signIn.social({ provider: "google", callbackURL: currentPath() })
    } catch {
      setNotice("No se pudo iniciar sesión con Google.")
      setBusy(null)
    }
  }

  const signOut = async () => {
    setBusy("logout")
    try {
      await authClient.signOut()
    } finally {
      setBusy(null)
      window.dispatchEvent(new Event(ACCOUNT_UPDATED_EVENT))
    }
  }

  const disconnectOpenRouter = async () => {
    setBusy("openrouter")
    try {
      await fetch("/api/connections/openrouter", { method: "DELETE", cache: "no-store" })
      setNotice("OpenRouter se desconectó de este navegador.")
    } finally {
      setBusy(null)
      window.dispatchEvent(new Event(ACCOUNT_UPDATED_EVENT))
    }
  }

  const box = compact ? "rounded-lg border border-slate-800 bg-[#080e18]/95 p-3" : "rounded-[26px] border border-slate-800 bg-[#080e18]/95 p-5 sm:p-6"
  // The sidebar is narrow even on wide screens: stack text and action unless there is room.
  const row = compact
    ? "flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#050a12] p-3"
    : "flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#050a12] p-4 sm:flex-row sm:items-center sm:justify-between"
  const action = compact ? "w-full" : ""

  return (
    <div className={box}>
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-2.5 text-cyan-200"><KeyRound className="h-4 w-4" /></div>
        <div>
          <p className="text-[9px] uppercase tracking-[.28em] text-slate-500">Sin API keys</p>
          <h3 className="mt-1 font-pixel text-sm uppercase text-slate-100">Tu cuenta</h3>
        </div>
      </div>

      {failed ? (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100">
          <p className="flex items-start gap-2"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> No pudimos cargar tu cuenta.</p>
          <button type="button" onClick={() => void refresh()} className={`${secondaryButton} ${action}`}><RefreshCw className="h-3.5 w-3.5" /> Reintentar</button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className={row}>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">OpenRouter {account.openrouter.connected ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300/10 px-2 py-0.5 text-[10px] font-normal uppercase tracking-wider text-emerald-200"><Check className="h-3 w-3" /> Conectado</span> : null}</p>
              <p className="mt-1 text-[12px] leading-5 text-slate-400">Un solo login para Claude, GPT, Grok y Gemini. Usa el crédito de tu cuenta de OpenRouter.</p>
            </div>
            {!loaded ? (
              <span className="text-[11px] text-slate-500">Revisando…</span>
            ) : account.openrouter.connected ? (
              <button type="button" onClick={() => void disconnectOpenRouter()} disabled={busy !== null} className={`${secondaryButton} ${action}`}>Desconectar</button>
            ) : account.openrouter.enabled ? (
              <a href={`/api/connections/openrouter/start?returnTo=${encodeURIComponent(currentPath())}`} className={`${primaryButton} ${action}`}><PlugZap className="h-3.5 w-3.5" /> Conectar con OpenRouter</a>
            ) : (
              <span className="text-[11px] text-slate-500">No disponible en este servidor</span>
            )}
          </div>

          <div className={row}>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100">Google</p>
              <p className="mt-1 break-words text-[12px] leading-5 text-slate-400">
                {account.user ? `${account.user.name} · ${account.user.email}` : account.google.enabled ? "Guardá tu sesión y tus conexiones en este navegador." : "Muy pronto vas a poder entrar con tu cuenta de Google."}
              </p>
            </div>
            {account.user ? (
              <button type="button" onClick={() => void signOut()} disabled={busy !== null} className={`${secondaryButton} ${action}`}><LogOut className="h-3.5 w-3.5" /> Salir</button>
            ) : account.google.enabled ? (
              <button type="button" onClick={() => void signIn()} disabled={busy !== null} className={`${primaryButton} ${action}`}><LogIn className="h-3.5 w-3.5" /> {busy === "google" ? "Abriendo Google…" : "Entrar con Google"}</button>
            ) : null}
          </div>
        </div>
      )}

      {notice ? <p role="status" className="mt-3 flex items-start gap-2 text-xs leading-5 text-cyan-100"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{notice}</p> : null}
    </div>
  )
}

const primaryButton = "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-40"
const secondaryButton = "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-[11px] uppercase tracking-[.14em] text-slate-300 transition hover:border-slate-500 disabled:opacity-40"
