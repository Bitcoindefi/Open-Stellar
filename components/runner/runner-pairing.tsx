"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Laptop } from "lucide-react"
import { parsePairingHash, RUNNER_COMMAND } from "@/lib/runner/pairing"
import { runnerStore } from "@/lib/runner/store"

type PairingState = "working" | "invalid" | "storage"

/**
 * Landing for the link the runner prints (/runner#<token>). Reads the token from the hash,
 * removes it from the address bar, saves it in this browser and goes back to the app.
 */
export function RunnerPairing() {
  const router = useRouter()
  const [state, setState] = useState<PairingState>("working")
  const handled = useRef(false)

  useEffect(() => {
    // Strict Mode runs effects twice in dev; the hash is already gone the second time.
    if (handled.current) return
    handled.current = true
    const pairing = parsePairingHash(window.location.hash)
    try {
      window.history.replaceState(null, "", window.location.pathname)
    } catch {
      // Not fatal: the hash never reaches a server anyway.
    }
    if (!pairing) {
      setState("invalid")
      return
    }
    if (!runnerStore.pair(pairing)) {
      setState("storage")
      return
    }
    try {
      localStorage.setItem("sidebar-tab", "models")
    } catch {
      // The app just opens on its default tab.
    }
    toast.success("Tu PC quedó vinculada", { description: "Tus agentes locales aparecen en Modelos IA y en el chat como Mi PC." })
    router.replace("/")
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#030712] px-4 text-slate-100">
      <div className="w-full max-w-md rounded-[26px] border border-cyan-400/20 bg-[#07101b]/95 p-6 shadow-[0_24px_80px_rgba(2,8,23,.5)]">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-2.5 text-cyan-200"><Laptop className="h-4 w-4" /></div>
          <h1 className="font-pixel text-sm uppercase">Conectá tu PC</h1>
        </div>
        {state === "working" ? (
          <p role="status" className="mt-4 font-mono text-xs leading-6 text-cyan-100">Vinculando este navegador con tu PC…</p>
        ) : (
          <div className="mt-4 space-y-3 font-mono text-xs leading-6 text-slate-300">
            <p role="alert" className="text-amber-200">
              {state === "invalid"
                ? "Este link no trae una clave válida. Copiá el link completo que muestra la terminal del runner."
                : "Tu navegador bloquea el almacenamiento local (modo privado o datos del sitio desactivados), así que no podemos guardar la vinculación."}
            </p>
            <p>Si todavía no lo corriste: <code className="text-cyan-200">{RUNNER_COMMAND}</code></p>
            <Link href="/" className="inline-flex min-h-10 items-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 text-[11px] uppercase tracking-[.14em] text-cyan-100">Volver a la ciudad</Link>
          </div>
        )}
      </div>
    </main>
  )
}
