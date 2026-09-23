export type RunStatus = "completed" | "failed" | "running"
export type RunStepStatus = "completed" | "failed" | "running" | "queued"

export interface RunStep {
  id: string
  runId: string
  agentId: string
  agentName: string
  task: string
  status: RunStepStatus
  input: Record<string, unknown>
  result?: Record<string, unknown>
  logs: string[]
  costXlm?: string
  durationMs?: number
  dependsOn?: string
  receiptId?: string
}

export interface OrchestrationRun {
  id: string
  goal: string
  status: RunStatus
  totalCostXlm: string
  startedAt: string
  endedAt?: string
  steps: RunStep[]
  mode?: "rerun" | "arena"
  supervisor?: {
    agentId: string
    agentName: string
    policy: string
  }
  requiredApprovals?: {
    id: string
    action: string
    reason: string
    status: "pending" | "approved" | "rejected"
    chain?: "stellar" | "solana" | "cosmos" | "evm"
  }[]
  tools?: {
    id: string
    label: string
    rail: "ai" | "wallet" | "repo" | "deploy" | "payments"
    approvalRequired: boolean
  }[]
}

export interface RunListItem {
  id: string
  goal: string
  status: RunStatus
  stepsCompleted: number
  stepsTotal: number
  durationMs?: number
  totalCostXlm: string
  startedAt: string
}

const globalState = globalThis as typeof globalThis & {
  __openStellarOrchestrationRuns__?: OrchestrationRun[]
  __openStellarOrchestrationRunSeq__?: number
}

function isoMinutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function msBetween(start: string, end?: string) {
  if (!end) return undefined
  return Math.max(0, Date.parse(end) - Date.parse(start))
}

function seedRuns(): OrchestrationRun[] {
  return [
    {
      id: "run_001",
      goal: "Analyze threat log and ship incident summary",
      status: "completed",
      totalCostXlm: "0.07",
      startedAt: isoMinutesAgo(126),
      endedAt: isoMinutesAgo(124),
      steps: [
        {
          id: "step_001_fetch",
          runId: "run_001",
          agentId: "bot-0",
          agentName: "Nexus-7",
          task: "fetch logs",
          status: "completed",
          input: { source: "defense-grid/syslog", window: "24h" },
          result: { files: 8, records: 18420 },
          logs: ["mounted defense-grid/syslog", "normalized 18,420 records"],
          costXlm: "0.01",
          durationMs: 12000,
          receiptId: "rcpt_run001_fetch",
        },
        {
          id: "step_002_analyze",
          runId: "run_001",
          agentId: "bot-1",
          agentName: "Cipher-3",
          task: "threat analysis",
          status: "completed",
          input: { records: 18420, severity: ["warn", "error"] },
          result: { findings: 4, highestSeverity: "medium" },
          logs: ["clustered auth failures", "flagged four correlated bursts"],
          costXlm: "0.05",
          durationMs: 98000,
          dependsOn: "step_001_fetch",
          receiptId: "rcpt_run001_analyze",
        },
        {
          id: "step_003_report",
          runId: "run_001",
          agentId: "bot-11",
          agentName: "Echo-12",
          task: "format report",
          status: "completed",
          input: { format: "markdown", audience: "operator" },
          result: { sections: 5, exported: true },
          logs: ["assembled timeline", "attached x402 receipt links"],
          costXlm: "0.01",
          durationMs: 4000,
          dependsOn: "step_002_analyze",
          receiptId: "rcpt_run001_report",
        },
      ],
    },
    {
      id: "run_002",
      goal: "Generate weekly service revenue report",
      status: "completed",
      totalCostXlm: "0.03",
      startedAt: isoMinutesAgo(302),
      endedAt: isoMinutesAgo(301),
      steps: [
        {
          id: "step_004_receipts",
          runId: "run_002",
          agentId: "bot-5",
          agentName: "Stratos-2",
          task: "aggregate receipts",
          status: "completed",
          input: { source: "x402", period: "7d" },
          result: { payments: 142, xlm: "6.82" },
          logs: ["read x402 registry", "grouped by service"],
          costXlm: "0.02",
          durationMs: 31000,
          receiptId: "rcpt_run002_receipts",
        },
        {
          id: "step_005_digest",
          runId: "run_002",
          agentId: "bot-2",
          agentName: "Pulse-9",
          task: "write digest",
          status: "completed",
          input: { template: "operator-weekly" },
          result: { exported: "weekly-revenue.md" },
          logs: ["ranked services", "estimated next-week capacity"],
          costXlm: "0.01",
          durationMs: 14000,
          dependsOn: "step_004_receipts",
          receiptId: "rcpt_run002_digest",
        },
      ],
    },
    {
      id: "run_003",
      goal: "Compress backup archives before cold storage",
      status: "failed",
      totalCostXlm: "0.02",
      startedAt: isoMinutesAgo(64),
      steps: [
        {
          id: "step_006_scan",
          runId: "run_003",
          agentId: "bot-3",
          agentName: "Vector-1",
          task: "scan archives",
          status: "completed",
          input: { bucket: "data-center-backups" },
          result: { archives: 37, gb: 81 },
          logs: ["listed backup manifests", "excluded active snapshots"],
          costXlm: "0.01",
          durationMs: 18000,
          receiptId: "rcpt_run003_scan",
        },
        {
          id: "step_007_compress",
          runId: "run_003",
          agentId: "bot-4",
          agentName: "Halo-5",
          task: "compress archives",
          status: "failed",
          input: { archives: 37, codec: "zstd" },
          result: { error: "insufficient scratch space" },
          logs: ["started zstd compression", "scratch disk threshold exceeded"],
          costXlm: "0.01",
          durationMs: 22000,
          dependsOn: "step_006_scan",
          receiptId: "rcpt_run003_compress",
        },
        {
          id: "step_008_store",
          runId: "run_003",
          agentId: "bot-0",
          agentName: "Nexus-7",
          task: "write cold storage manifest",
          status: "queued",
          input: { destination: "cold-storage" },
          logs: ["waiting for compressed archive output"],
          dependsOn: "step_007_compress",
        },
      ],
    },
  ]
}

function runsStore() {
  if (!globalState.__openStellarOrchestrationRuns__) {
    globalState.__openStellarOrchestrationRuns__ = seedRuns()
    globalState.__openStellarOrchestrationRunSeq__ = 4
  }

  return globalState.__openStellarOrchestrationRuns__
}

export function resetOrchestrationRunsForTests() {
  globalState.__openStellarOrchestrationRuns__ = seedRuns()
  globalState.__openStellarOrchestrationRunSeq__ = 4
}

export function summarizeRun(run: OrchestrationRun): RunListItem {
  const stepsCompleted = run.steps.filter((step) => step.status === "completed").length
  return {
    id: run.id,
    goal: run.goal,
    status: run.status,
    stepsCompleted,
    stepsTotal: run.steps.length,
    durationMs: msBetween(run.startedAt, run.endedAt),
    totalCostXlm: run.totalCostXlm,
    startedAt: run.startedAt,
  }
}

export function listOrchestrationRuns() {
  const runs = [...runsStore()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
  return {
    runs: runs.map(summarizeRun),
    stats: {
      totalRuns: runs.length,
      completedRuns: runs.filter((run) => run.status === "completed").length,
      failedRuns: runs.filter((run) => run.status === "failed").length,
      totalCostXlm: runs.reduce((sum, run) => sum + Number(run.totalCostXlm), 0).toFixed(2),
    },
  }
}

export function getOrchestrationRun(runId: string) {
  return runsStore().find((run) => run.id === runId) ?? null
}

export function estimateRerun(run: OrchestrationRun) {
  const originalCost = Number(run.totalCostXlm)
  const retryFactor = run.status === "failed" ? 0.75 : 1
  const estimatedCost = Number((originalCost * retryFactor).toFixed(2))
  return {
    originalCostXlm: run.totalCostXlm,
    estimatedCostXlm: estimatedCost.toFixed(2),
    deltaXlm: (estimatedCost - originalCost).toFixed(2),
  }
}

export function createRerun(sourceRunId: string) {
  const source = getOrchestrationRun(sourceRunId)
  if (!source) return null

  const sequence = globalState.__openStellarOrchestrationRunSeq__ ?? 4
  globalState.__openStellarOrchestrationRunSeq__ = sequence + 1
  const runId = `run_${String(sequence).padStart(3, "0")}`
  const now = new Date().toISOString()
  const estimate = estimateRerun(source)
  const rerun: OrchestrationRun = {
    id: runId,
    goal: source.goal,
    status: "running",
    totalCostXlm: estimate.estimatedCostXlm,
    startedAt: now,
    steps: source.steps.map((step, index) => ({
      ...step,
      id: `${runId}_step_${String(index + 1).padStart(2, "0")}`,
      runId,
      status: index === 0 ? "running" : "queued",
      result: undefined,
      logs: index === 0 ? [`re-run queued from ${source.id}`, "agent dispatch started"] : [`waiting for step ${index}`],
      durationMs: undefined,
      receiptId: undefined,
      dependsOn: index === 0 ? undefined : `${runId}_step_${String(index).padStart(2, "0")}`,
    })),
  }

  runsStore().unshift(rerun)
  return { run: rerun, estimate, sourceRun: source }
}

export function createArenaRun(goal: string) {
  const sequence = globalState.__openStellarOrchestrationRunSeq__ ?? 4
  globalState.__openStellarOrchestrationRunSeq__ = sequence + 1
  const runId = `run_${String(sequence).padStart(3, "0")}`
  const now = new Date().toISOString()
  const normalizedGoal = goal.trim() || "Coordinate a multichain agent mission"

  const run: OrchestrationRun = {
    id: runId,
    goal: normalizedGoal,
    status: "running",
    totalCostXlm: "0.04",
    startedAt: now,
    mode: "arena",
    supervisor: {
      agentId: "arena-orca",
      agentName: "Agentic City Orchestrator",
      policy: "Supervisor decomposes the request, routes workers, pauses on wallet/deploy/repo approvals, and asks JEV/Laya for evaluation evidence.",
    },
    requiredApprovals: [
      {
        id: `${runId}_approval_solana`,
        action: "Connect Solana wallet",
        reason: "A user-owned Phantom or Solflare wallet must approve signing before any Solana rail can be assigned to an agent.",
        status: "pending",
        chain: "solana",
      },
      {
        id: `${runId}_approval_deploy`,
        action: "Deploy or external publish",
        reason: "Public deployment, repo mutation, and external messages stay gated behind explicit operator approval.",
        status: "pending",
      },
    ],
    tools: [
      { id: "tool_jev", label: "JEV typed evaluator", rail: "ai", approvalRequired: false },
      { id: "tool_laya", label: "Laya local decision sidecar", rail: "ai", approvalRequired: false },
      { id: "tool_solana_wallet", label: "Phantom / Solflare wallet", rail: "wallet", approvalRequired: true },
      { id: "tool_stellar_wallet", label: "Freighter Stellar wallet", rail: "wallet", approvalRequired: true },
      { id: "tool_cosmos_pay", label: "CosmosPay checkout", rail: "payments", approvalRequired: true },
      { id: "tool_repo_patch", label: "Repository patch writer", rail: "repo", approvalRequired: true },
      { id: "tool_vercel", label: "Vercel production deploy", rail: "deploy", approvalRequired: true },
    ],
    steps: [
      {
        id: `${runId}_step_01_supervise`,
        runId,
        agentId: "arena-orca",
        agentName: "Agentic City Orchestrator",
        task: "plan worker graph",
        status: "completed",
        input: { goal: normalizedGoal, style: "minimal-grok-bot + orca-supervisor" },
        result: { workers: ["research", "builder", "wallet", "evaluator"], approvalGates: 2 },
        logs: ["received operator goal", "split mission into supervised worker lanes", "attached wallet/deploy approval gates"],
        costXlm: "0.01",
        durationMs: 3200,
        receiptId: `${runId}_receipt_supervise`,
      },
      {
        id: `${runId}_step_02_research`,
        runId,
        agentId: "arena-research",
        agentName: "Research Scout",
        task: "collect context and examples",
        status: "running",
        input: { sources: ["project state", "agentic patterns", "wallet rails"] },
        logs: ["checking local project capabilities", "waiting for live research connector if enabled"],
        costXlm: "0.01",
        dependsOn: `${runId}_step_01_supervise`,
      },
      {
        id: `${runId}_step_03_wallets`,
        runId,
        agentId: "arena-wallet",
        agentName: "Wallet Marshal",
        task: "bind user wallets to agent rails",
        status: "queued",
        input: { rails: ["stellar:freighter", "solana:phantom|solflare", "cosmos:cosmospay"] },
        logs: ["waiting for Solana wallet approval signature"],
        dependsOn: `${runId}_step_02_research`,
      },
      {
        id: `${runId}_step_04_evaluate`,
        runId,
        agentId: "arena-jev",
        agentName: "JEV Referee",
        task: "score readiness and risk",
        status: "queued",
        input: { evaluator: "typesafe-ai/jev", sidecar: "laya optional" },
        logs: ["waiting for worker evidence"],
        dependsOn: `${runId}_step_03_wallets`,
      },
    ],
  }

  runsStore().unshift(run)
  return { run }
}

export function formatDuration(ms?: number) {
  if (ms === undefined) return "-"
  const seconds = Math.round(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`
}
