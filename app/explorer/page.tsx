import { ReceiptTable } from '@/components/explorer/receipt-table'
import { listX402ExplorerReceipts } from '@/lib/protocols/x402'

export default function ExplorerPage() {
  const data = listX402ExplorerReceipts({ pageSize: 50 })

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <div className="mb-3 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-200">
            x402 transparency
          </div>
          <h1 className="font-mono text-3xl font-bold uppercase text-cyan-100">Payment Explorer</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Public receipt history for x402 settlements recorded by this Open Stellar instance.
            Use the API at <code className="text-cyan-200">/api/explorer/receipts</code> for the same paginated data.
          </p>
        </div>

        <ReceiptTable initialData={data} />
      </div>
    </main>
  )
}

