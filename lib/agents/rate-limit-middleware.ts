import { consumeRateLimit } from "@/lib/agents/rate-limit-store"

export function checkRateLimit(agentId: string): { allowed: boolean; retryAfterMs?: number } {
  return consumeRateLimit(agentId)
}