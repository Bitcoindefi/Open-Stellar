import { describe, expect, it, vi } from "vitest"
import { RUNNER_STORAGE_KEY } from "@/lib/runner/pairing"
import { createRunnerStore, runnerStore } from "@/lib/runner/store"

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345"

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key) },
    setItem: (key, value) => { data.set(key, String(value)) },
  }
}

const readyBody = { ok: true, runner: { version: "0.1.0" }, agents: [{ id: "codex", label: "Codex CLI", installed: true, version: "0.150.1", loggedIn: false }] }

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

describe("runner store", () => {
  it("does not touch the network until paired or asked to detect", async () => {
    const fetchImpl = vi.fn()
    const store = createRunnerStore({ fetchImpl: fetchImpl as unknown as typeof fetch, storage: () => memoryStorage() })
    const snapshot = await store.refresh()
    expect(snapshot.status).toEqual({ state: "unpaired" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("detects a running but unpaired runner on request", async () => {
    const fetchImpl = vi.fn(async () => json(401, { error: "unauthorized" }))
    const store = createRunnerStore({ fetchImpl: fetchImpl as unknown as typeof fetch, storage: () => memoryStorage(), now: () => 99 })
    const snapshot = await store.refresh({ detect: true })
    expect(snapshot).toEqual({ pairing: null, status: { state: "unauthorized" }, checkedAt: 99 })
  })

  it("loads a saved pairing, checks it and notifies subscribers", async () => {
    const storage = memoryStorage({ [RUNNER_STORAGE_KEY]: JSON.stringify({ token: TOKEN, port: 7421, pairedAt: "x" }) })
    const fetchImpl = vi.fn(async () => json(200, readyBody))
    const store = createRunnerStore({ fetchImpl: fetchImpl as unknown as typeof fetch, storage: () => storage })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    expect(store.getSnapshot().pairing?.token).toBe(TOKEN)
    const pending = store.refresh()
    expect(store.getSnapshot().status).toEqual({ state: "checking" })
    // A second caller shares the request in flight.
    expect(store.refresh()).toBe(pending)
    const snapshot = await pending
    expect(snapshot.status).toMatchObject({ state: "ready", version: "0.1.0", agents: [{ id: "codex", loggedIn: false }] })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalled()
    // While ready, a re-check keeps the list on screen instead of flashing "checking".
    const again = store.refresh({ probe: true })
    expect(store.getSnapshot().status.state).toBe("ready")
    await again
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toContain("probe=1")
    unsubscribe()
  })

  it("pairs and unpairs", async () => {
    const storage = memoryStorage()
    const store = createRunnerStore({ fetchImpl: (async () => json(200, readyBody)) as unknown as typeof fetch, storage: () => storage })
    expect(store.pair({ token: TOKEN, port: 7500, pairedAt: "now" })).toBe(true)
    expect(storage.getItem(RUNNER_STORAGE_KEY)).toContain(TOKEN)
    expect(store.getSnapshot()).toMatchObject({ pairing: { port: 7500 }, status: { state: "checking" } })
    await store.refresh()
    expect(store.getSnapshot().status.state).toBe("ready")
    store.unpair()
    expect(store.getSnapshot()).toEqual({ pairing: null, status: { state: "unpaired" }, checkedAt: null })
    expect(storage.getItem(RUNNER_STORAGE_KEY)).toBeNull()
  })

  it("reports blocked storage when pairing", () => {
    const store = createRunnerStore({ storage: () => null })
    expect(store.pair({ token: TOKEN, port: 7421, pairedAt: "" })).toBe(false)
    expect(store.getSnapshot().pairing?.token).toBe(TOKEN)
  })

  it("has a stable server snapshot and a default instance", () => {
    expect(runnerStore.getServerSnapshot()).toBe(runnerStore.getServerSnapshot())
    expect(runnerStore.getServerSnapshot().status.state).toBe("unpaired")
    expect(runnerStore.getSnapshot().pairing).toBeNull()
  })
})
