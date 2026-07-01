export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#030712] px-6 text-slate-100">
      <div className="rounded-3xl border border-rose-500/30 bg-slate-950/90 px-8 py-10 text-center shadow-[0_24px_80px_rgba(2,8,23,0.45)]">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-rose-300">403</p>
        <h1 className="mt-4 font-pixel text-2xl uppercase text-slate-100">Admin Access Required</h1>
        <p className="mt-4 max-w-md font-mono text-sm leading-6 text-slate-400">
          The provided admin token did not match the server configuration.
        </p>
      </div>
    </main>
  )
}
