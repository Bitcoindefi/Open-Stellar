"use client"

import { useEffect, useSyncExternalStore } from "react"
import { runnerStore } from "@/lib/runner/store"

const POLL_MS = 20_000

/**
 * The local runner as seen from this browser. Only a paired browser talks to 127.0.0.1 on its
 * own; an unpaired one waits for the person to click "Detectar" (see RunnerCard).
 */
export function useRunner({ poll = false }: { poll?: boolean } = {}) {
  const snapshot = useSyncExternalStore(runnerStore.subscribe, runnerStore.getSnapshot, runnerStore.getServerSnapshot)
  const paired = Boolean(snapshot.pairing)

  useEffect(() => {
    if (!paired) return
    void runnerStore.refresh()
    if (!poll) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void runnerStore.refresh()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [paired, poll])

  return { ...snapshot, refresh: runnerStore.refresh, unpair: runnerStore.unpair }
}
