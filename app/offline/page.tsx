export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-[#030712] flex flex-col items-center justify-center text-slate-100 gap-4">
      <h1 className="font-mono text-2xl text-cyan-300">You're offline</h1>
      <p className="text-slate-400 text-sm">Open Stellar will reconnect when your network is back.</p>
    </main>
  )
}
