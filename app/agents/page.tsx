import { Suspense } from "react"
import { AgentsRegistry } from "@/components/agents-registry"

export default function AgentsPage() {
  return (
    <main className="min-h-screen bg-[#030712] text-slate-100">
      <Suspense fallback={<div className="p-8 text-center text-slate-400 font-mono">Loading...</div>}>
        <AgentsRegistry />
      </Suspense>
    </main>
  )
}
