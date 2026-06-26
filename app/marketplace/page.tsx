import type { Metadata } from 'next'
import { MarketplaceCatalog } from '@/components/marketplace/service-card'
import { listMarketplaceServices } from '@/lib/marketplace/services'

export const metadata: Metadata = {
  title: 'Open Stellar Marketplace',
  description: 'Discover x402 agent services registered with Open Stellar providers.',
}

export default function MarketplacePage() {
  const services = listMarketplaceServices()
  const online = services.filter((service) => service.status === 'online').length
  const totalCalls = services.reduce((sum, service) => sum + service.totalCalls, 0)

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 overflow-hidden rounded-[32px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_35%),#020617] p-6 shadow-2xl shadow-cyan-950/30 md:p-8">
          <div className="mb-3 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-200">
            x402 service marketplace
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <h1 className="font-mono text-3xl font-bold uppercase text-cyan-100 md:text-5xl">Discover agent services</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400 md:text-base">
                Browse provider APIs that accept x402 payments on Open Stellar. Compare price, district ownership,
                live status, receipts served, latency, and reputation before wiring a service into your agent workflow.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <HeroStat label="Services" value={services.length.toString()} />
              <HeroStat label="Online" value={online.toString()} />
              <HeroStat label="Calls" value={totalCalls.toLocaleString()} />
            </div>
          </div>
        </div>

        <MarketplaceCatalog services={services} />
      </div>
    </main>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-center">
      <div className="font-mono text-xl text-cyan-100">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
    </div>
  )
}
