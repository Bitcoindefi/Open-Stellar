import type { Metadata } from "next"
import { RunsHistory } from "@/components/admin/runs-history"
import { listOrchestrationRuns } from "@/lib/orchestration/runs"

export const metadata: Metadata = {
  title: "Orchestration Runs | Open Stellar Admin",
  description: "Review completed and failed multi-agent orchestration runs with step detail, receipts, and re-run estimates.",
}

export default function AdminRunsPage() {
  return <RunsHistory initialData={listOrchestrationRuns()} />
}
