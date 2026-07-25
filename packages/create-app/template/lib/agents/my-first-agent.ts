export interface OpenStellarAgent {
  id: string
  name: string
  description: string
  serviceId: string
  network: 'testnet' | 'mainnet'
}

export const myFirstAgent: OpenStellarAgent = {
  id: 'my-first-agent',
  name: 'My First Agent',
  description: 'Example agent wired to the x402 payment rail',
  serviceId: 'my-service',
  network: (process.env.STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'),
}

export function listAgents(): OpenStellarAgent[] {
  return [myFirstAgent]
}
