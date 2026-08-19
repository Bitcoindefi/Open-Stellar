'use client'

import { useMemo, useState } from 'react'
import type { X402ExplorerReceipt } from '@/lib/protocols/x402'

interface ReceiptExplorerPayload {
  receipts: X402ExplorerReceipt[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  stats: {
    totalPayments: number
    totalUsd: number
    uniqueAgents: number
    services: number
  }
}

function shortHash(hash: string) {
  if (hash.length <= 16) return hash
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`
}

function formatUsd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: n > 0 && n < 0.01 ? 4 : 2,
    maximumFractionDigits: n > 0 && n < 0.01 ? 4 : 2,
  }).format(n)
}

export function ReceiptTable({ initialData }: { initialData: ReceiptExplorerPayload }) {
  const [query, setQuery] = useState('')
  const [chain, setChain] = useState('all')
  const [selected, setSelected] = useState<X402ExplorerReceipt | null>(null)

  const receipts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return initialData.receipts.filter((receipt) => {
      if (chain !== 'all' && receipt.chain !== chain) return false
      if (!needle) return true
      return [
        receipt.id,
        receipt.agent,
        receipt.serviceId,
        receipt.txHash,
        receipt.paymentRef,
      ].join(' ').toLowerCase().includes(needle)
    })
  }, [chain, initialData.receipts, query])

  return (
    <section className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Payments" value={initialData.stats.totalPayments.toLocaleString()} />
        <Stat label="Volume" value={formatUsd(initialData.stats.totalUsd)} />
        <Stat label="Agents" value={initialData.stats.uniqueAgents.toLocaleString()} />
        <Stat label="Services" value={initialData.stats.services.toLocaleString()} />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 md:flex-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search receipts, agents, services, or hashes"
          className="min-h-10 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 font-mono text-sm text-slate-100 outline-none focus:border-cyan-400"
        />
        <select
          value={chain}
          onChange={(event) => setChain(event.target.value)}
          className="min-h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 font-mono text-sm text-slate-100 outline-none focus:border-cyan-400"
        >
          <option value="all">All chains</option>
          <option value="stellar">Stellar</option>
          <option value="bnb">BNB</option>
          <option value="base">Base</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-900 text-[11px] uppercase tracking-[0.24em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Receipt</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Chain</th>
              <th className="px-4 py-3">TX</th>
              <th className="px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center font-mono text-sm text-slate-500">
                  No x402 receipts match the current filters.
                </td>
              </tr>
            ) : (
              receipts.map((receipt) => (
                <tr
                  key={receipt.id}
                  onClick={() => setSelected(receipt)}
                  className="cursor-pointer border-t border-slate-800 text-slate-200 transition hover:bg-slate-900/70"
                >
                  <td className="px-4 py-3 font-mono text-cyan-200">{receipt.id}</td>
                  <td className="px-4 py-3">{receipt.agent}</td>
                  <td className="px-4 py-3">{receipt.serviceId}</td>
                  <td className="px-4 py-3 font-mono">{formatUsd(receipt.amountUsd)}</td>
                  <td className="px-4 py-3 uppercase">{receipt.chain}</td>
                  <td className="px-4 py-3 font-mono text-slate-400">
                    {receipt.explorerUrl ? (
                      <a
                        href={receipt.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-cyan-400 underline-offset-2 hover:underline"
                      >
                        {shortHash(receipt.txHash)}
                      </a>
                    ) : (
                      shortHash(receipt.txHash)
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{new Date(receipt.settledAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="rounded-2xl border border-cyan-500/30 bg-slate-950 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-mono text-sm uppercase tracking-[0.24em] text-cyan-200">Receipt JSON</h2>
            <div className="flex items-center gap-2">
              {selected.explorerUrl && (
                <a
                  href={selected.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-cyan-700 px-2 py-1 font-mono text-xs uppercase text-cyan-300 transition hover:border-cyan-400 hover:text-cyan-100"
                >
                  View on explorer ↗
                </a>
              )}
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded border border-slate-700 px-2 py-1 font-mono text-xs uppercase text-slate-300"
              >
                Close
              </button>
            </div>
          </div>
          <pre className="max-h-80 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-200">
            {JSON.stringify(selected, null, 2)}
          </pre>
        </div>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
      <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-xl text-cyan-200">{value}</div>
    </div>
  )
}

