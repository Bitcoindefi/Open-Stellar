"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Activity, AlertTriangle, Check, Cloud, Code2, Copy, Cpu, Download, ExternalLink, Fingerprint, ReceiptText, History, KeyRound, Layers3, ListChecks, RadioTower, Rocket, Server, Shield, Terminal, Wallet } from "lucide-react"
import type { District, MoltbotAgent } from "@/lib/types"
import { PassportPanel } from "@/components/admin/passport-panel"
import { buildVercelDeployUrl } from "@/lib/vercel-deploy-url"
import { generateAdminApiKey } from "@/lib/admin-api-key.client"

type AdminTab = "overview" | "queue" | "passport" | "private-deploy" | "receipts" | "cloud-agents"

type Plan = {
  name: string
  price: string
  requests: string
  teams: string
  features: string[]
  accent: string
}

type AdminConsoleProps = {
  agents: MoltbotAgent[]
  districts: District[]
}

const plans: Plan[] = [
  {
    name: "Starter",
    price: "1 XLM/mo",
    requests: "100 calls / month",
    teams: "1 squad",
    features: ["Single API key", "Shared x402 settlement rail", "Base request throttling"],
    accent: "text-cyan-300",
  },
  {
    name: "Growth",
    price: "5 XLM/mo",
    requests: "1,000 calls / month",
    teams: "5 squads",
    features: ["Multi-team orchestration", "Priority relay lanes", "Usage and policy controls"],
    accent: "text-amber-300",
  },
  {
    name: "Pro",
    price: "20 XLM/mo",
    requests: "10,000 calls / month",
    teams: "Unlimited squads",
    features: ["Dedicated infra pool", "Audit log retention", "Custom billing rules"],
    accent: "text-emerald-300",
  },
]

const nodeDisplayName = process.env.NEXT_PUBLIC_NODE_NAME || "Open Stellar"
const monthlyLimit = 1000
const monthlyUsed = 153

const subscriptions = [
  { agent: "nexus-7", service: "my-data-api", plan: "Growth", used: 153, limit: 1000, renewsAt: "2026-07-22", mrr: "5 XLM", status: "active" },
  { agent: "atlas-2", service: "market-feed", plan: "Starter", used: 42, limit: 100, renewsAt: "2026-07-18", mrr: "1 XLM", status: "active" },
  { agent: "vega-9", service: "routing-api", plan: "Pro", used: 6610, limit: 10000, renewsAt: "2026-07-09", mrr: "20 XLM", status: "grace" },
] as const

export function AdminConsole({ agents, districts }: AdminConsoleProps) {
  const [copied, setCopied] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<Plan>(plans[1])
  const [tab, setTab] = useState<AdminTab>("overview")
  const [demoKey] = useState(() => generateAdminApiKey())

  const activeAgents = agents.filter((agent) => agent.status === "active" || agent.status === "working")
  const totalTasks = agents.reduce((sum, agent) => sum + agent.tasksCompleted, 0)
  const avgCpu = Math.round(agents.reduce((sum, agent) => sum + agent.cpu, 0) / Math.max(1, agents.length))
  const avgMemory = Math.round(agents.reduce((sum, agent) => sum + agent.memory, 0) / Math.max(1, agents.length))
  const usagePercent = Math.round((monthlyUsed / monthlyLimit) * 100)
  const remaining = Math.max(0, monthlyLimit - monthlyUsed)
  const subscriptionMrr = subscriptions.reduce((sum, subscription) => sum + Number(subscription.mrr.split(" ")[0]), 0)
  const topAgents = [...agents].sort((a, b) => b.tasksCompleted - a.tasksCompleted).slice(0, 5)
  const districtCards = districts.map((district) => {
    const squad = agents.filter((agent) => agent.district === district.id)
    const working = squad.filter((agent) => agent.status === "working").length
    const avgLoad = Math.round(squad.reduce((sum, agent) => sum + agent.cpu, 0) / Math.max(1, squad.length))

    return {
      district,
      squad,
      working,
      avgLoad,
    }
  })

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(demoKey)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#04070d] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_28%),radial-gradient(circle_at_85%_20%,_rgba(251,191,36,0.12),_transparent_22%),linear-gradient(180deg,_rgba(3,7,18,0.85),_rgba(3,7,18,0.96))]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(148,163,184,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.6)_1px,transparent_1px)] [background-size:28px_28px]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="rounded-[28px] border border-cyan-500/20 bg-slate-950/80 p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.7),0_24px_80px_rgba(2,8,23,0.55)] backdrop-blur">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.32em] text-cyan-200">
                  <RadioTower className="h-3.5 w-3.5" />
                  {nodeDisplayName}
                </div>
                <h1 className="font-pixel text-2xl uppercase leading-tight text-cyan-100 sm:text-3xl">
                  Agent Payments Infra for Orchestrated Teams
                </h1>
                <p className="mt-4 max-w-2xl font-vt323 text-xl leading-7 text-slate-300">
                  The admin view now matches the city control surface: same mock squads, same districts,
                  and the same operating tone. Here you sell x402 payment rails, API access, and request-capped
                  orchestration as a managed layer on top of the main simulation.
                </p>
              </div>

              <div className="grid min-w-[280px] gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <SignalStat label="Active keys" value={String(activeAgents.length)} color="text-cyan-300" />
                <SignalStat label="Tasks routed" value={formatCompact(totalTasks * 1440)} color="text-emerald-300" />
                <SignalStat label="MRR" value={`${subscriptionMrr} XLM`} color="text-amber-300" />
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-800 bg-slate-950/80 p-5 shadow-[0_24px_80px_rgba(2,8,23,0.5)] backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Issued key</p>
                <p className="mt-3 font-mono text-sm text-cyan-200 sm:text-base">{demoKey}</p>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-200"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <InfoRow icon={<KeyRound className="h-4 w-4" />} label="Scope" value="agent.orchestrate / payments.charge / teams.read" />
              <InfoRow icon={<Shield className="h-4 w-4" />} label="Mode" value="Subscription + monthly cap" />
              <InfoRow icon={<Wallet className="h-4 w-4" />} label="Remaining" value={`${remaining.toLocaleString()} calls`} />
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-[#09101a] p-4">
              <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.28em] text-slate-500">
                <span>Monthly call meter</span>
                <span>{usagePercent}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-900">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#22d3ee_0%,#38bdf8_45%,#fbbf24_100%)] transition-all"
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <p className="mt-3 font-vt323 text-lg text-slate-300">
                When the cap is reached, withX402 can return 402 again, throttle, or upsell the agent into a higher recurring plan.
              </p>
            </div>
          </section>
        </header>

        <nav className="flex flex-wrap gap-2">
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={<RadioTower className="h-3.5 w-3.5" />}>
            Orchestration overview
          </TabButton>
          <TabButton active={tab === "receipts"} onClick={() => setTab("receipts")} icon={<ReceiptText className="h-3.5 w-3.5" />}>
            Receipts
          </TabButton>
          <a
            href="/admin/runs"
            className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/70 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
          >
            <History className="h-3.5 w-3.5" />
            Runs history
          </a>
          <TabButton active={tab === "queue"} onClick={() => setTab("queue")} icon={<ListChecks className="h-3.5 w-3.5" />}>
            Task queue
          </TabButton>
          <TabButton active={tab === "passport"} onClick={() => setTab("passport")} icon={<Fingerprint className="h-3.5 w-3.5" />}>
            Agent Passport (ZK)
          </TabButton>
          <TabButton active={tab === "private-deploy"} onClick={() => setTab("private-deploy")} icon={<Rocket className="h-3.5 w-3.5" />}>
            Private Deploy
          </TabButton>
          <TabButton active={tab === "cloud-agents"} onClick={() => setTab("cloud-agents")} icon={<Cloud className="h-3.5 w-3.5" />}>
            Cloud Agents
          </TabButton>
        </nav>

        {tab === "queue" ? (
          <TaskQueueTab />
        ): tab === "receipts" ? (
          <ReceiptsTab />
        ) : tab === "passport" ? (
          <section className="rounded-[28px] border border-cyan-500/20 bg-slate-950/60 p-5">
            <div className="mb-5 max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.32em] text-cyan-200">
                <Fingerprint className="h-3.5 w-3.5" />
                Zero-knowledge trust layer
              </div>
              <h2 className="font-pixel text-xl uppercase leading-tight text-cyan-100">
                Prove an agent is solvent &amp; authorized — without doxxing the owner
              </h2>
              <p className="mt-3 font-vt323 text-xl leading-7 text-slate-300">
                Each agent mints a ZK passport (Groth16 / Soroban) proving it is backed by a verified human and is
                solvent for its spend cap. The x402 settlement rail then releases a payment only when the agent holds a
                valid passport and the amount stays within its proven, hidden cap.
              </p>
            </div>
            <PassportPanel />
          </section>
        ) : tab === "private-deploy" ? (
          <PrivateDeployTab />
        ) : tab === "cloud-agents" ? (
          <CloudAgentsTab />
        ) : (
        <>
        <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr_0.8fr]">
          <Panel
            title="Infra posture"
            eyebrow="Runtime telemetry"
            bodyClassName="space-y-3"
          >
            <TelemetryRow icon={<Cpu className="h-4 w-4" />} label="Average CPU" value={`${avgCpu}%`} tone="text-cyan-300" />
            <TelemetryRow icon={<Activity className="h-4 w-4" />} label="Average memory" value={`${avgMemory}%`} tone="text-violet-300" />
            <TelemetryRow icon={<Layers3 className="h-4 w-4" />} label="District teams" value={String(districts.length)} tone="text-amber-300" />
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Business frame</p>
              <p className="mt-3 font-vt323 text-lg leading-6 text-slate-300">
                Monthly subscription buys access to orchestration control plus the x402 payment extension.
                Request volume is the primary limiter, not seats.
              </p>
            </div>
          </Panel>

          <Panel
            title="District squads"
            eyebrow="Main page parity"
            bodyClassName="grid gap-4 md:grid-cols-2"
          >
            {districtCards.map(({ district, squad, working, avgLoad }) => (
              <div key={district.id} className="rounded-[22px] border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-pixel text-sm uppercase text-slate-100">{district.name}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.28em] text-slate-500">
                      {squad.length} agents / {working} working now
                    </p>
                  </div>
                  <span className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: district.color }} />
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-900">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${avgLoad}%`, backgroundColor: district.color }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {squad.slice(0, 4).map((agent) => (
                    <span
                      key={agent.id}
                      className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 font-mono text-[11px] text-slate-300"
                    >
                      {agent.name}
                    </span>
                  ))}
                </div>

                <p className="mt-4 font-vt323 text-lg text-slate-300">
                  Suggested as an isolated customer squad with policy-based request caps and shared payment settlement.
                </p>
              </div>
            ))}
          </Panel>

          <Panel
            title="Subscription lanes"
            eyebrow="x402 recurring billing"
            bodyClassName="space-y-3"
          >
            {plans.map((plan) => {
              const isActive = plan.name === selectedPlan.name
              return (
                <button
                  key={plan.name}
                  type="button"
                  onClick={() => setSelectedPlan(plan)}
                  className={`w-full rounded-[22px] border p-4 text-left transition ${
                    isActive
                      ? "border-cyan-400/40 bg-cyan-400/10"
                      : "border-slate-800 bg-slate-950/70 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className={`font-pixel text-sm uppercase ${plan.accent}`}>{plan.name}</p>
                      <p className="mt-2 text-[10px] uppercase tracking-[0.28em] text-slate-500">{plan.requests}</p>
                    </div>
                    <p className="font-mono text-sm text-slate-100">{plan.price}</p>
                  </div>
                  <p className="mt-3 font-vt323 text-lg text-slate-300">{plan.teams}</p>
                </button>
              )
            })}

            <div className="rounded-[22px] border border-slate-800 bg-[#09101a] p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Selected lane</p>
              <h3 className="mt-3 font-pixel text-base uppercase text-cyan-100">{selectedPlan.name}</h3>
              <ul className="mt-4 space-y-2">
                {selectedPlan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 font-vt323 text-lg text-slate-300">
                    <Check className="h-4 w-4 text-emerald-400" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </section>



        <Panel title="Active x402 subscriptions" eyebrow="Admin billing console" bodyClassName="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.24em] text-slate-500">
                  <th className="pb-3 font-normal">Subscriber</th>
                  <th className="pb-3 font-normal">Service</th>
                  <th className="pb-3 font-normal">Plan</th>
                  <th className="pb-3 font-normal">Calls</th>
                  <th className="pb-3 font-normal">Next renewal</th>
                  <th className="pb-3 font-normal">MRR</th>
                  <th className="pb-3 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((subscription) => (
                  <tr key={`${subscription.agent}-${subscription.service}`} className="border-b border-slate-900/80 font-mono text-xs text-slate-300">
                    <td className="py-3 text-cyan-200">{subscription.agent}</td>
                    <td className="py-3">{subscription.service}</td>
                    <td className="py-3">{subscription.plan}</td>
                    <td className="py-3">{subscription.used.toLocaleString()} / {subscription.limit.toLocaleString()}</td>
                    <td className="py-3">{subscription.renewsAt}</td>
                    <td className="py-3 text-emerald-300">{subscription.mrr}</td>
                    <td className="py-3">
                      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${subscription.status === "active" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300"}`}>
                        {subscription.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
          <Panel title="Top operators" eyebrow="Main page agents" bodyClassName="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            {topAgents.map((agent) => (
              <div key={agent.id} className="rounded-[20px] border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-mono text-sm" style={{ color: agent.color }}>{agent.name}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      {agent.model} / {agent.status}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-cyan-200">{agent.tasksCompleted} tasks</p>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{agent.district}</p>
                  </div>
                </div>
              </div>
            ))}
          </Panel>

          <Panel title="Offer framing" eyebrow="What this screen is selling" bodyClassName="grid gap-3 md:grid-cols-3">
            <FeatureBlock
              title="Agent teams"
              text="Package districts as customer squads with isolated routing, policies, and operational telemetry."
            />
            <FeatureBlock
              title="x402 extension"
              text="Use the payment rail as a monetized extension layer for request-triggered or workflow-triggered charges."
            />
            <FeatureBlock
              title="Request quotas"
              text="Anchor the subscription on monthly volume. It is easier to explain, meter, and upsell than raw infrastructure seats."
            />
          </Panel>
        </section>
        </>
        )}
      </div>
    </main>
  )
}

type AdminReceipt = {
  id: string
  agentId: string
  agent?: string
  service: string
  serviceId?: string
  amount: string
  txHash: string
  settledAt: string
  passportVerified: boolean
}

function ReceiptsTab() {
  const [receipts, setReceipts] = useState<AdminReceipt[]>([])
  const [status, setStatus] = useState('Loading receipts…')

  useEffect(() => {
    let mounted = true
    fetch('/api/protocol/x402/receipts?pageSize=50')
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return
        setReceipts(Array.isArray(data.receipts) ? data.receipts : [])
        setStatus(data.ok ? '' : data.error || 'Failed to load receipts')
      })
      .catch(() => {
        if (mounted) setStatus('Failed to load receipts')
      })

    return () => {
      mounted = false
    }
  }, [])

  const csv = useMemo(() => {
    const rows = [['id', 'agentId', 'service', 'amount', 'settledAt', 'txHash', 'passportVerified']]
    for (const receipt of receipts) {
      rows.push([
        receipt.id,
        receipt.agentId || receipt.agent || '',
        receipt.service || receipt.serviceId || '',
        receipt.amount,
        receipt.settledAt,
        receipt.txHash,
        String(receipt.passportVerified),
      ])
    }
    return rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
  }, [receipts])

  const exportCsv = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'x402-receipts.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="rounded-[28px] border border-cyan-500/20 bg-slate-950/60 p-5">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.32em] text-cyan-200">
            <ReceiptText className="h-3.5 w-3.5" />
            Persistent x402 ledger
          </div>
          <h2 className="font-pixel text-xl uppercase leading-tight text-cyan-100">Receipts</h2>
          <p className="mt-3 font-vt323 text-xl leading-7 text-slate-300">
            Last 50 settled x402 receipts from the receipt database, including agent, service, amount, and timestamp.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={receipts.length === 0}
          className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-cyan-200 transition hover:border-cyan-400/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-[22px] border border-slate-800 bg-slate-950/80">
        <div className="grid grid-cols-[1fr_1fr_0.8fr_0.9fr] gap-3 border-b border-slate-800 px-4 py-3 text-[10px] uppercase tracking-[0.24em] text-slate-500 md:grid-cols-[1fr_1fr_0.7fr_0.9fr_1.2fr]">
          <span>Agent</span>
          <span>Service</span>
          <span>Amount</span>
          <span>Timestamp</span>
          <span className="hidden md:block">Tx hash</span>
        </div>
        {status ? (
          <p className="px-4 py-6 font-vt323 text-xl text-slate-400">{status}</p>
        ) : receipts.length === 0 ? (
          <p className="px-4 py-6 font-vt323 text-xl text-slate-400">No x402 receipts have been recorded yet.</p>
        ) : (
          receipts.map((receipt) => (
            <div key={receipt.id} className="grid grid-cols-[1fr_1fr_0.8fr_0.9fr] gap-3 border-b border-slate-900 px-4 py-3 font-mono text-xs text-slate-300 last:border-b-0 md:grid-cols-[1fr_1fr_0.7fr_0.9fr_1.2fr]">
              <span className="truncate text-cyan-200">{receipt.agentId || receipt.agent}</span>
              <span className="truncate">{receipt.service || receipt.serviceId}</span>
              <span className="text-emerald-300">{receipt.amount}</span>
              <span>{new Date(receipt.settledAt).toLocaleString()}</span>
              <span className="hidden truncate text-slate-500 md:block">{receipt.txHash}</span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

const API_ENDPOINTS = [
  { method: "POST", path: "/api/protocol/x402/quote",        desc: "Create x402 payment quote" },
  { method: "POST", path: "/api/protocol/x402/settle",       desc: "Settle x402 payment (optional passport gate)" },
  { method: "POST", path: "/api/protocol/x402/subscriptions", desc: "Create recurring x402 API subscription" },
  { method: "GET",  path: "/api/protocol/x402/subscriptions/:agentId/:serviceId", desc: "Check active subscription access" },
  { method: "POST", path: "/api/protocol/passport/authorize",desc: "ZK spend-cap authorization gate" },
  { method: "GET",  path: "/api/protocol/passport/status",   desc: "On-chain agent passport lookup" },
  { method: "GET",  path: "/api/protocol/reputation",        desc: "Agent reputation query" },
  { method: "POST", path: "/api/protocol/reputation",        desc: "Record reputation action" },
  { method: "GET",  path: "/api/protocol/track8004",         desc: "ERC-8004 agent identity resolution" },
  { method: "GET",  path: "/api/stellar/balance",            desc: "Stellar account balance" },
  { method: "POST", path: "/api/stellar/build-tx",           desc: "Build and sign Stellar transaction" },
  { method: "POST", path: "/api/stellar/submit-tx",          desc: "Submit signed transaction" },
  { method: "POST", path: "/api/stellar/fund",               desc: "Friendbot testnet funding" },
] as const

const ENV_VARS = [
  { name: "NEXT_PUBLIC_NODE_NAME", example: "My Open Stellar Node", desc: "Display name in the admin console header" },
  { name: "STELLAR_NETWORK", example: "testnet", desc: "Stellar network: testnet or mainnet" },
  { name: "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", example: "abc123…", desc: "WalletConnect Cloud project ID" },
  { name: "ADMIN_API_KEY", example: "osk_…", desc: "Admin API key (auto-generated on first boot if unset)" },
  { name: "NEXT_PUBLIC_APP_URL", example: "https://your-instance.vercel.app", desc: "Public URL of your deployment" },
] as const

function PrivateDeployTab() {
  const deployUrl = useMemo(() => {
    const adminApiKey = generateAdminApiKey()
    return buildVercelDeployUrl({
      nodeName: process.env.NEXT_PUBLIC_NODE_NAME || "My Open Stellar Node",
      network: "testnet",
      adminApiKey,
    })
  }, [])
  return (
    <>
      <section className="rounded-[28px] border border-amber-500/20 bg-slate-950/80 p-5 shadow-[0_24px_80px_rgba(2,8,23,0.45)] backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.32em] text-amber-200">
              <Rocket className="h-3.5 w-3.5" />
              Private deployment
            </div>
            <h2 className="font-pixel text-2xl uppercase leading-tight text-cyan-100">
              Run your own Open Stellar node
            </h2>
            <p className="mt-4 max-w-2xl font-vt323 text-xl leading-7 text-slate-300">
              Fork the repository, configure your Stellar and x402 credentials, and deploy to Vercel in under
              five minutes. Your instance runs the same payment rails, agent passport ZK layer, and reputation
              system as this one — fully isolated, fully yours.
            </p>
          </div>

          <a
            href={deployUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-5 py-3 text-xs uppercase tracking-[0.2em] text-amber-200 transition hover:border-amber-400/70 hover:bg-amber-400/20 hover:text-amber-100"
          >
            <Rocket className="h-3.5 w-3.5" />
            Deploy to Vercel
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.65fr_1.35fr]">
        <section className="rounded-[28px] border border-slate-800 bg-slate-950/80 p-5 shadow-[0_24px_80px_rgba(2,8,23,0.45)] backdrop-blur">
          <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Setup guide</p>
          <h3 className="mt-3 font-pixel text-lg uppercase text-slate-100">Quick start</h3>
          <div className="mt-5 space-y-4">
            <DeployStep n={1} title="Scaffold" text="Run npx create-open-stellar-app my-node or fork bitcoindefi/Open-Stellar on GitHub. The repo includes ZK artifacts and Soroban bindings." />
            <DeployStep n={2} title="Configure" text="Set node name, network, and WalletConnect project ID. An admin API key is generated automatically on first boot." />
            <DeployStep n={3} title="Deploy" text="Push to main — Vercel picks it up automatically. The vercel.json enforces --webpack mode for snarkjs compatibility." />
          </div>

          <div className="mt-6 space-y-2">
            <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Environment variables</p>
            {ENV_VARS.map((v) => (
              <div key={v.name} className="rounded-[18px] border border-slate-800 bg-[#09101a] p-3">
                <p className="font-mono text-xs text-amber-300">{v.name}</p>
                <p className="mt-1 font-mono text-[11px] text-slate-500">e.g. {v.example}</p>
                <p className="mt-1 font-vt323 text-base text-slate-400">{v.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <a
              href="https://github.com/bitcoindefi/Open-Stellar"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200"
            >
              <Code2 className="h-3.5 w-3.5" />
              View source
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://github.com/bitcoindefi/open-stellar-passport"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200"
            >
              <Shield className="h-3.5 w-3.5" />
              ZK passport repo
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-800 bg-slate-950/80 p-5 shadow-[0_24px_80px_rgba(2,8,23,0.45)] backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Developer API</p>
              <h3 className="mt-3 font-pixel text-lg uppercase text-slate-100">Endpoints</h3>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-slate-400">
              <Server className="h-3.5 w-3.5" />
              REST / JSON
            </div>
          </div>

          <p className="font-vt323 text-lg leading-6 text-slate-400">
            All endpoints are available on your private instance at{" "}
            <span className="font-mono text-cyan-300">https://{"<your-domain>"}</span>. Authenticate with the
            issued key shown on the overview panel. The x402 and passport endpoints run against Stellar testnet by
            default; swap the contract addresses and RPC URL in <span className="font-mono text-slate-300">lib/passport/passport.ts</span> for mainnet.
          </p>

          <div className="mt-5 space-y-2">
            {API_ENDPOINTS.map((ep) => (
              <div
                key={ep.path}
                className="flex items-center gap-3 rounded-[18px] border border-slate-800 bg-[#09101a] px-4 py-3"
              >
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] uppercase ${
                    ep.method === "GET"
                      ? "bg-emerald-400/10 text-emerald-300"
                      : "bg-amber-400/10 text-amber-300"
                  }`}
                >
                  {ep.method}
                </span>
                <span className="flex-1 font-mono text-xs text-slate-300">{ep.path}</span>
                <span className="hidden font-vt323 text-base text-slate-500 xl:block">{ep.desc}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[22px] border border-slate-800 bg-[#09101a] p-4">
            <div className="flex items-start gap-3">
              <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Test your instance</p>
                <pre className="mt-2 font-mono text-xs text-slate-300 leading-5">
{`curl https://<your-domain>/api/protocol/x402/quote \\
  -H "Authorization: Bearer <api-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":"0.1","asset":"XLM","recipient":"G..."}'`}
                </pre>
              </div>
            </div>
          </div>
        </section>
      </section>
    </>
  )
}

function CloudAgentsTab() {
  const [name, setName] = useState("Edge Scout")
  const [status, setStatus] = useState<string | null>(null)
  const [endpoint, setEndpoint] = useState<string | null>(null)

  const provision = async () => {
    setStatus("Provisioning Vercel Edge agent...")
    const res = await fetch("/api/admin/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, model: "claude-4-sonnet", district: "research", queueMode: "post" }),
    })
    const data = await res.json()
    if (!res.ok) {
      setStatus(data.error || "Failed to provision cloud agent")
      return
    }
    setEndpoint(data.config.endpointUrl)
    setStatus("Cloud agent provisioned. It will appear on the city canvas with a cloud badge.")
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Provision cloud agent" eyebrow="Vercel Edge runtime" bodyClassName="space-y-4">
        <p className="font-vt323 text-xl leading-7 text-slate-300">
          Create an agent config and expose it at <span className="font-mono text-cyan-300">/agents/:agentId</span>. The Edge route accepts task POSTs and streams 15s SSE heartbeats.
        </p>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-sm text-slate-100 outline-none transition focus:border-cyan-400/60"
          placeholder="Agent name"
        />
        <button
          type="button"
          onClick={provision}
          className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-5 py-3 text-xs uppercase tracking-[0.2em] text-cyan-200 transition hover:bg-cyan-400/20"
        >
          <Cloud className="h-3.5 w-3.5" />
          Provision Agent
        </button>
        {status ? <p className="font-vt323 text-lg text-emerald-300">{status}</p> : null}
        {endpoint ? <p className="break-all font-mono text-xs text-slate-300">{endpoint}</p> : null}
      </Panel>
      <Panel title="Execution contract" eyebrow="Issue #21 acceptance" bodyClassName="grid gap-3 md:grid-cols-2">
        <FeatureBlock title="POST tasks" text="The orchestrator sends JSON tasks to /agents/:agentId; the Edge Function calls Claude when ANTHROPIC_API_KEY is configured." />
        <FeatureBlock title="SSE heartbeat" text="GET /agents/:agentId keeps the connection open and emits heartbeat events every 15 seconds." />
        <FeatureBlock title="Canvas badge" text="Provisioned cloud agents are merged into the city and rendered with a CLOUD badge above the sprite." />
        <FeatureBlock title="Realtime status" text="Task start/completion and heartbeat updates flow through the existing health store and system event stream." />
      </Panel>
    </section>
  )
}

function DeployStep({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 font-mono text-xs text-amber-300">
        {n}
      </div>
      <div>
        <p className="font-pixel text-xs uppercase text-slate-200">{title}</p>
        <p className="mt-1.5 font-vt323 text-lg leading-6 text-slate-400">{text}</p>
      </div>
    </div>
  )
}


type QueueTask = {
  id: string
  type: string
  priority: "critical" | "high" | "normal" | "low"
  status: string
  targetAgentId?: string
  targetDistrict?: string
  targetCapability?: string
  retryCount: number
  maxRetries: number
  scheduledFor?: string
  error?: string
}

function TaskQueueTab() {
  const [tasks, setTasks] = useState<QueueTask[]>([])
  const [loading, setLoading] = useState(true)

  const loadTasks = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/tasks?includeDeadLetter=1", { cache: "no-store" })
      const data = await res.json()
      setTasks(data.tasks ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTasks()
  }, [])

  const retryTask = async (taskId: string) => {
    await fetch(`/api/tasks/${taskId}/retry`, { method: "POST" })
    await loadTasks()
  }

  const deadLetter = tasks.filter((task) => task.status === "dead-letter")
  const pending = tasks.filter((task) => task.status === "pending")

  return (
    <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Queue lanes" eyebrow="Durable routing" bodyClassName="space-y-3">
        <TelemetryRow icon={<ListChecks className="h-4 w-4" />} label="Pending tasks" value={String(pending.length)} tone="text-cyan-300" />
        <TelemetryRow icon={<AlertTriangle className="h-4 w-4" />} label="Dead-letter tasks" value={String(deadLetter.length)} tone="text-rose-300" />
        <p className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 font-vt323 text-lg leading-6 text-slate-300">
          Agents pull prioritized work by direct agent, district, or capability. Failures retry with exponential backoff before moving into the dead-letter lane.
        </p>
      </Panel>

      <Panel title="Dead-letter retry" eyebrow="Manual recovery" bodyClassName="space-y-3">
        {loading ? (
          <p className="font-vt323 text-lg text-slate-400">Loading queue...</p>
        ) : deadLetter.length === 0 ? (
          <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 font-vt323 text-lg text-emerald-200">
            No dead-letter items. Failed tasks will appear here with one-click retry.
          </p>
        ) : (
          deadLetter.map((task) => (
            <div key={task.id} className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-mono text-sm text-rose-100">{task.id}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">{task.type} / {task.priority}</p>
                  <p className="mt-2 text-sm text-slate-300">{task.error ?? "No error recorded"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => retryTask(task.id)}
                  className="rounded-full border border-rose-300/40 px-3 py-2 text-xs uppercase tracking-[0.2em] text-rose-100 transition hover:bg-rose-300/10"
                >
                  Retry
                </button>
              </div>
            </div>
          ))
        )}
      </Panel>
    </section>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs uppercase tracking-[0.2em] transition ${
        active
          ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
          : "border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200"
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

function Panel({
  title,
  eyebrow,
  bodyClassName,
  children,
}: {
  title: string
  eyebrow: string
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-[28px] border border-slate-800 bg-slate-950/80 p-5 shadow-[0_24px_80px_rgba(2,8,23,0.45)] backdrop-blur">
      <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">{eyebrow}</p>
      <h2 className="mt-3 font-pixel text-lg uppercase text-slate-100">{title}</h2>
      <div className={`mt-5 ${bodyClassName ?? ""}`}>{children}</div>
    </section>
  )
}

function SignalStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-[20px] border border-slate-800 bg-[#09101a] p-3">
      <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className={`mt-2 font-pixel text-sm uppercase ${color}`}>{value}</p>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
      <div className="mt-0.5 text-cyan-300">{icon}</div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{label}</p>
        <p className="mt-1 font-mono text-sm text-slate-200">{value}</p>
      </div>
    </div>
  )
}

function TelemetryRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  tone: string
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="text-slate-400">{icon}</div>
        <p className="text-sm text-slate-300">{label}</p>
      </div>
      <p className={`font-mono text-sm ${tone}`}>{value}</p>
    </div>
  )
}

function FeatureBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[20px] border border-slate-800 bg-slate-950/70 p-4">
      <p className="font-pixel text-sm uppercase text-cyan-200">{title}</p>
      <p className="mt-3 font-vt323 text-lg leading-6 text-slate-300">{text}</p>
    </div>
  )
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}
