// One shared view of the local runner for every component that needs it (the "Conectá tu PC"
// card and the chat). Plain functions plus a tiny subscribe API, so React reads it with
// useSyncExternalStore and the logic is tested in node.

import { fetchRunnerStatus, type RunnerStatus } from "@/lib/runner/client"
import {
  RUNNER_DEFAULT_PORT,
  clearRunnerPairing,
  readRunnerPairing,
  writeRunnerPairing,
  type RunnerPairing,
} from "@/lib/runner/pairing"

export type RunnerSnapshot = { pairing: RunnerPairing | null; status: RunnerStatus; checkedAt: number | null }

type StoreOptions = {
  fetchImpl?: typeof fetch
  storage?: () => Storage | null
  now?: () => number
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

const SERVER_SNAPSHOT: RunnerSnapshot = { pairing: null, status: { state: "unpaired" }, checkedAt: null }

export function createRunnerStore({ fetchImpl, storage = browserStorage, now = Date.now }: StoreOptions = {}) {
  let snapshot: RunnerSnapshot = { pairing: null, status: { state: "unpaired" }, checkedAt: null }
  let loaded = false
  let inflight: Promise<RunnerSnapshot> | null = null
  const listeners = new Set<() => void>()

  const publish = (next: RunnerSnapshot) => {
    snapshot = next
    listeners.forEach((listener) => listener())
  }

  const load = () => {
    if (loaded) return
    loaded = true
    const pairing = readRunnerPairing(storage())
    if (pairing) snapshot = { ...snapshot, pairing }
  }

  /**
   * Checks the runner. Without a pairing it only looks when `detect` is set (the person clicked
   * "Detectar"), so visitors who never ran the runner do not trigger a local-network prompt.
   */
  const refresh = ({ probe = false, detect = false }: { probe?: boolean; detect?: boolean } = {}): Promise<RunnerSnapshot> => {
    load()
    if (inflight && !probe) return inflight
    const pairing = snapshot.pairing
    if (!pairing && !detect) {
      publish({ pairing: null, status: { state: "unpaired" }, checkedAt: snapshot.checkedAt })
      return Promise.resolve(snapshot)
    }
    // Keep showing the last good list while re-checking, so the chips do not flicker.
    if (snapshot.status.state !== "ready") publish({ ...snapshot, status: { state: "checking" } })
    const port = pairing?.port ?? RUNNER_DEFAULT_PORT
    const request = fetchRunnerStatus(port, pairing?.token ?? null, { probe, ...(fetchImpl ? { fetchImpl } : {}) })
      .then((status) => {
        publish({ pairing, status, checkedAt: now() })
        return snapshot
      })
      .finally(() => {
        if (inflight === request) inflight = null
      })
    inflight = request
    return request
  }

  return {
    getSnapshot: (): RunnerSnapshot => {
      load()
      return snapshot
    },
    getServerSnapshot: (): RunnerSnapshot => SERVER_SNAPSHOT,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    refresh,
    /** Saves a new pairing (from the /runner link) and checks it. Returns false if storage is blocked. */
    pair(pairing: RunnerPairing): boolean {
      load()
      const saved = writeRunnerPairing(pairing, storage())
      publish({ pairing, status: { state: "checking" }, checkedAt: snapshot.checkedAt })
      return saved
    },
    unpair() {
      load()
      clearRunnerPairing(storage())
      publish({ pairing: null, status: { state: "unpaired" }, checkedAt: null })
    },
  }
}

export type RunnerStore = ReturnType<typeof createRunnerStore>

export const runnerStore = createRunnerStore()
