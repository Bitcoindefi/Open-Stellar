'use client'

import { useEffect, useMemo, useState } from 'react'
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
    totalXlm?: string
    uniqueAgents: number
    services: number
  }
}

function shortHash(hash: string) {
  if (!hash) return ''
  if (hash.length <= 16) return hash
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`
}

function formatRelativeTime(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const now = Date.now()
    const diffSec = Math.floor((now - d.getTime()) / 1000)
    if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 30) return `${diffDays}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function getChainBadgeStyle(chain: string) {
  switch (chain?.toLowerCase()) {
    case 'stellar':
      return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-300'
    case 'base':
      return 'border-blue-400/30 bg-blue-500/10 text-blue-300'
    case 'bnb':
      return 'border-amber-400/30 bg-amber-500/10 text-amber-300'
    default:
      return 'border-slate-700 bg-slate-800 text-slate-300'
  }
}

export function ReceiptTable({ initialData }: { initialData: ReceiptExplorerPayload }) {
  const [query, setQuery] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [chain, setChain] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50
  const [selected, setSelected] = useState<X402ExplorerReceipt | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCopyJson = (obj: unknown) => {
    try {
      void navigator.clipboard.writeText(JSON.stringify(obj, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!selected) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selected])

  const resetFilters = () => {
    setQuery('')
    setServiceFilter('')
    setChain('all')
    setStartDate('')
    setEndDate('')
    setCurrentPage(1)
  }

  const filteredReceipts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const svcNeedle = serviceFilter.trim().toLowerCase()
    const fromTime = startDate ? new Date(startDate).getTime() : null
    const toTime = endDate ? new Date(endDate).getTime() : null

    return initialData.receipts.filter((receipt) => {
      if (chain !== 'all' && receipt.chain?.toLowerCase() !== chain.toLowerCase()) return false
      if (svcNeedle && !receipt.service?.toLowerCase().includes(svcNeedle) && !receipt.serviceId?.toLowerCase().includes(svcNeedle)) {
        return false
      }
      if (fromTime !== null && !Number.isNaN(fromTime)) {
        if (new Date(receipt.settledAt).getTime() < fromTime) return false
      }
      if (toTime !== null && !Number.isNaN(toTime)) {
        // match up to end of selected day (23:59:59)
        const endOfDay = toTime + 86400000 - 1
        if (new Date(receipt.settledAt).getTime() > endOfDay) return false
      }
      if (!needle) return true
      return [
        receipt.id,
        receipt.agent,
        receipt.agentId,
        receipt.serviceId,
        receipt.service,
        receipt.txHash,
        receipt.paymentRef,
        receipt.amount,
      ].filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  }, [chain, endDate, initialData.receipts, query, serviceFilter, startDate])

  const totalFiltered = filteredReceipts.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const paginatedReceipts = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredReceipts.slice(start, start + pageSize)
  }, [currentPage, filteredReceipts, pageSize])

  return (
    <section className="space-y-6">
      {/* Summary stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total Payments Processed" value={initialData.stats.totalPayments.toLocaleString()} />
        <Stat label="Total XLM Transferred" value={initialData.stats.totalXlm || `${(initialData.stats.totalUsd / 0.1).toFixed(2)} XLM`} />
        <Stat label="Unique Agents" value={initialData.stats.uniqueAgents.toLocaleString()} />
        <Stat label="Services Registered" value={initialData.stats.services.toLocaleString()} />
      </div>

      {/* Filters bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setCurrentPage(1)
              }}
              placeholder="Search by agent name, service, hash, or receipt ID..."
              className="w-full min-h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 font-mono text-sm text-slate-100 outline-none transition focus:border-cyan-400"
            />
          </div>

          <input
            value={serviceFilter}
            onChange={(e) => {
              setServiceFilter(e.target.value)
              setCurrentPage(1)
            }}
            placeholder="Filter by service..."
            className="min-h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 font-mono text-sm text-slate-100 outline-none transition focus:border-cyan-400 md:w-48"
          />

          <select
            value={chain}
            onChange={(e) => {
              setChain(e.target.value)
              setCurrentPage(1)
            }}
            className="min-h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 font-mono text-sm text-slate-100 outline-none transition focus:border-cyan-400 md:w-36"
          >
            <option value="all">All Chains</option>
            <option value="stellar">Stellar</option>
            <option value="bnb">BNB</option>
            <option value="base">Base</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono uppercase text-slate-500">Date Range:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setCurrentPage(1)
              }}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-slate-200 outline-none focus:border-cyan-400"
            />
            <span>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setCurrentPage(1)
              }}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-slate-200 outline-none focus:border-cyan-400"
            />
          </div>

          {(query || serviceFilter || chain !== 'all' || startDate || endDate) && (
            <button
              type="button"
              onClick={resetFilters}
              className="font-mono text-cyan-400 hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Receipts Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-900/90 text-[11px] uppercase tracking-[0.2em] text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Receipt ID</th>
                <th className="px-4 py-3 font-semibold">Agent</th>
                <th className="px-4 py-3 font-semibold">Service</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">TX Hash</th>
                <th className="px-4 py-3 font-semibold">Chain</th>
                <th className="px-4 py-3 font-semibold">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {paginatedReceipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="mx-auto max-w-sm space-y-2">
                      <div className="text-2xl">🔍</div>
                      <div className="font-mono text-sm font-medium text-slate-300">
                        No x402 receipts match the current filters.
                      </div>
                      <div className="text-xs text-slate-500">
                        Try adjusting your search terms, clearing date bounds, or selecting another chain.
                      </div>
                      {(query || serviceFilter || chain !== 'all' || startDate || endDate) && (
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="mt-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs text-cyan-300 transition hover:bg-slate-800 hover:text-cyan-200"
                        >
                          Clear All Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedReceipts.map((receipt) => {
                  const displayAmount = receipt.amount || `${receipt.amountUsd} USD`
                  return (
                    <tr
                      key={receipt.id}
                      onClick={() => setSelected(receipt)}
                      className="cursor-pointer text-slate-200 transition hover:bg-slate-900/70"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-cyan-300 hover:underline">
                        {receipt.id}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-200">
                        {receipt.agent || receipt.agentId || 'anonymous'}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {receipt.service || receipt.serviceId}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-emerald-400">
                        {displayAmount}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {receipt.explorerUrl ? (
                          <a
                            href={receipt.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-cyan-400 underline-offset-2 hover:underline"
                            title={receipt.txHash}
                          >
                            <span>{shortHash(receipt.txHash)}</span>
                            <span className="text-[10px]">↗</span>
                          </a>
                        ) : (
                          <span title={receipt.txHash}>{shortHash(receipt.txHash)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${getChainBadgeStyle(receipt.chain)}`}>
                          {receipt.chain}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 font-mono text-xs text-slate-400"
                        title={new Date(receipt.settledAt).toISOString()}
                      >
                        {formatRelativeTime(receipt.settledAt)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 font-mono text-xs text-slate-400">
            <div>
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalFiltered)} of {totalFiltered} receipts
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
              >
                Previous
              </button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Receipt detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close backdrop"
            className="fixed inset-0 h-full w-full cursor-default bg-black/80 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-cyan-500/30 bg-slate-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-400">
                  x402 Verified Receipt
                </div>
                <h2 id="receipt-modal-title" className="mt-1 font-mono text-lg font-bold text-slate-100">
                  {selected.id}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-slate-700 p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Metadata badges */}
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Passport Status</div>
                <div className="mt-1 font-mono text-xs font-semibold text-cyan-300">
                  {selected.passportVerified ? 'ZK verified? ✓' : 'Unverified'}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Reputation Tier</div>
                <div className="mt-1 font-mono text-xs font-semibold capitalize text-amber-300">
                  {selected.reputationTier || 'standard'}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Settlement Chain</div>
                <div className="mt-1 font-mono text-xs font-semibold uppercase text-slate-200">
                  {selected.chain}
                </div>
              </div>
            </div>

            {/* Explorer button */}
            {selected.explorerUrl && (
              <div className="mb-4">
                <a
                  href={selected.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                >
                  <span>Verify Transaction on {selected.chain === 'stellar' ? 'Stellar Expert' : 'Block Explorer'}</span>
                  <span>↗</span>
                </a>
              </div>
            )}

            {/* JSON Viewer */}
            <div className="relative">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono">Receipt Payload (JSON)</span>
                <button
                  type="button"
                  onClick={() => handleCopyJson(selected)}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-300 transition hover:bg-slate-800"
                >
                  {copied ? '✓ Copied' : 'Copy JSON'}
                </button>
              </div>
              <pre className="max-h-64 overflow-auto rounded-xl border border-slate-800 bg-slate-900/90 p-4 font-mono text-xs text-cyan-200">
                {JSON.stringify(selected, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
      <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-xl font-bold text-cyan-200">{value}</div>
    </div>
  )
}

