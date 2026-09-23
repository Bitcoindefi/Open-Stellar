import type { Metadata } from "next"
import { RunsHistory } from "@/components/admin/runs-history"
import { listOrchestrationRuns } from "@/lib/orchestration/runs"

export const metadata: Metadata = {
  title: "Orchestration Runs | Agent City Admin",
  description: "Review completed and failed multi-agent orchestration runs with step detail, receipts, and re-run estimates.",
}

export default async function AdminRunsPage({ searchParams }: { searchParams?: Promise<{ run?: string }> }) {
  const params = await searchParams
  return <RunsHistory initialData={listOrchestrationRuns()} initialRunId={params?.run} />
}
