import { getAdminApiKey } from '@/lib/admin-api-key'
import { listAgents } from '@/lib/agents/my-first-agent'

const nodeName = process.env.NEXT_PUBLIC_NODE_NAME || '__NODE_NAME__'
const network = process.env.STELLAR_NETWORK || '__NETWORK__'

export default function HomePage() {
  const agents = listAgents()
  const adminKey = getAdminApiKey()

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: 12, color: '#67e8f9' }}>
        Open Stellar Node
      </p>
      <h1 style={{ fontSize: '2rem', marginTop: '0.5rem' }}>{nodeName}</h1>
      <p style={{ color: '#94a3b8', lineHeight: 1.6 }}>
        Network: <strong>{network}</strong> | Deploy target: <strong>__DEPLOY_TARGET__</strong>
      </p>

      <section style={{ marginTop: '2rem', padding: '1.25rem', border: '1px solid #1e293b', borderRadius: 16 }}>
        <h2 style={{ fontSize: '1.1rem' }}>Admin API key</h2>
        <p style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{adminKey}</p>
      </section>

      <section style={{ marginTop: '1.5rem', padding: '1.25rem', border: '1px solid #1e293b', borderRadius: 16 }}>
        <h2 style={{ fontSize: '1.1rem' }}>Agents</h2>
        <ul>
          {agents.map((agent) => (
            <li key={agent.id}>
              {agent.name} - <code>{agent.serviceId}</code>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: '1.5rem', padding: '1.25rem', border: '1px solid #1e293b', borderRadius: 16 }}>
        <h2 style={{ fontSize: '1.1rem' }}>x402 gated route</h2>
        <p>
          <code>GET /api/my-service</code> with header <code>x-payment-ref</code> after creating a quote.
        </p>
      </section>
    </main>
  )
}
