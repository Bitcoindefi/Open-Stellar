export type PollOptions = {
  /** Wait between attempts. */
  intervalMs: number
  /** Give up once this much time has passed since the start. */
  timeoutMs: number
  /** Stops early, e.g. when the component that started the poll unmounts. */
  isCancelled?: () => boolean
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Calls `attempt` until it returns a value (not null), waiting `intervalMs` before each try.
 * Resolves null on timeout or cancellation. Used where another system catches up later, such as
 * the 8004 indexer, which shows a new review some seconds after its transaction lands.
 */
export async function pollUntil<T>(attempt: () => Promise<T | null>, options: PollOptions): Promise<T | null> {
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const cancelled = options.isCancelled ?? (() => false)
  const deadline = now() + options.timeoutMs
  while (!cancelled() && now() < deadline) {
    await sleep(options.intervalMs)
    if (cancelled()) return null
    const value = await attempt().catch(() => null)
    if (value !== null) return value
  }
  return null
}
