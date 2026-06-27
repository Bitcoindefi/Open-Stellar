const MEMORY_BLOCKLIST = new Map<string, number>()

export interface BlocklistCheck {
  blocked: boolean
  resetAt: number
}

function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url, token } : null
}

async function kvCommand<T>(command: unknown[]): Promise<T | null> {
  const config = kvConfig()
  if (!config) return null

  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify([command]),
  })

  if (!response.ok) {
    console.warn("rate_limit_blocklist_kv_error", { status: response.status })
    return null
  }

  const payload = (await response.json()) as Array<{ result?: T; error?: string }>
  if (payload[0]?.error) {
    console.warn("rate_limit_blocklist_kv_error", { error: payload[0].error })
    return null
  }
  return payload[0]?.result ?? null
}

function blockKey(ip: string): string {
  return `blocklist:ip:${ip}`
}

export async function isIpBlocked(ip: string, now: number = Date.now()): Promise<BlocklistCheck> {
  const memoryResetAt = MEMORY_BLOCKLIST.get(ip)
  if (memoryResetAt) {
    if (memoryResetAt > now) return { blocked: true, resetAt: memoryResetAt }
    MEMORY_BLOCKLIST.delete(ip)
  }

  const kvResetAt = await kvCommand<string | number>(["GET", blockKey(ip)])
  const resetAt = typeof kvResetAt === "number" ? kvResetAt : Number(kvResetAt ?? 0)
  return resetAt > now ? { blocked: true, resetAt } : { blocked: false, resetAt: 0 }
}

export async function blockIp(ip: string, ttlSeconds: number, now: number = Date.now()): Promise<number> {
  const resetAt = now + ttlSeconds * 1000
  MEMORY_BLOCKLIST.set(ip, resetAt)
  await kvCommand(["SET", blockKey(ip), String(resetAt), "EX", ttlSeconds])
  return resetAt
}

export function resetBlocklistForTests(): void {
  MEMORY_BLOCKLIST.clear()
}
