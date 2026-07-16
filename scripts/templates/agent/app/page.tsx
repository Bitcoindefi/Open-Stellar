import { agent } from '@/lib/agent'

export default function Page() {
  return (
    <main style={{ maxWidth: 760, margin: '64px auto', padding: '0 24px', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ margin: 0, color: '#4f46e5', fontWeight: 700 }}>Open Stellar Agent</p>
      <h1 style={{ margin: '12px 0', fontSize: 44, lineHeight: 1.05 }}>{agent.name}</h1>
      <p style={{ color: '#475569', fontSize: 18 }}>{agent.description}</p>
      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>Capabilities</h2>
        <ul>
          {agent.capabilities.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
      </section>
    </main>
  )
}
