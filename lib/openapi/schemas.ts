import { z } from "zod"

export const DISTRICTS = ["data-center", "comm-hub", "processing", "defense", "research"] as const
export const AGENT_STATUSES = ["active", "idle", "working", "error", "offline"] as const

const nonEmptyString = z.string().trim().min(1)

export const agentRegistrationSchema = z.object({
  agentId: nonEmptyString,
  model: nonEmptyString,
  district: z.enum(DISTRICTS),
  capabilities: z.array(nonEmptyString),
  skillVersions: z.array(z.object({
    id: nonEmptyString,
    version: nonEmptyString.optional(),
    minCallerVersion: nonEmptyString.optional(),
  })).optional(),
  dependencies: z.array(nonEmptyString).optional(),
  x402: z.object({
    accepts: z.boolean(),
    pricePerTask: nonEmptyString.optional(),
  }),
  status: z.enum(AGENT_STATUSES),
  endpoint: nonEmptyString.url(),
})

export type AgentRegistrationInput = z.infer<typeof agentRegistrationSchema>
