export type AgentRegistration = {
  id: string
  name: string
  description: string
  capabilities: string[]
  run: (input: string) => Promise<string>
}

export const agent: AgentRegistration = {
  id: 'starter-agent',
  name: 'Starter Agent',
  description: 'A minimal Open Stellar agent ready for local development.',
  capabilities: ['status', 'echo'],
  async run(input: string): Promise<string> {
    return `Starter Agent received: ${input}`
  },
}
