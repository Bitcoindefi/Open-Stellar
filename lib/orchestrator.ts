import { createAgents } from "@/lib/data"
import { enqueueTask } from "@/lib/agent-runtime/task-queue"
import { listRegisteredAgents, type AgentCapabilityManifest } from "@/lib/agent-registry"
import { publishSystemEvent } from "@/lib/events/system-events"
import { addOrchestrationRun, type OrchestrationRun, type RunStep } from "@/lib/orchestration/runs"
import { planWorkflow, type PlannedTask } from "@/lib/planner"
import type { MoltbotAgent } from "@/lib/types"

export interface OrchestrateInput {
  goal: unknown
  budget?: unknown
  deadline?: unknown
  apiKey?: string
}

export interface OrchestrationPlanStep {
  step: number
  agent: string
  task: string
  dep?: number[]
  estimatedCost: string
  queueTaskId: string
}

function toCost(value: number): string {
  return value.toFixed(2)
}

function registeredAgentToMoltbot(agent: AgentCapabilityManifest): MoltbotAgent {
  return {
    id: agent.agentId,
    name: agent.agentId,
    model: agent.model,
    status: agent.status,
    district: agent.district,
    cpu: 0,
    memory: 0,
    tasksCompleted: 0,
    currentTask: null,
    taskProgress: 0,
    color: "#22d3ee",
    pixelX: 0,
    pixelY: 0,
    targetX: 0,
    targetY: 0,
    frame: 0,
    direction: "right",
    spriteId: 0,
    skills: agent.capabilities.map((capability, index) => ({ id: `${agent.agentId}-cap-${index}`, name: capability, level: 1, maxLevel: 5, xp: 0, xpToNext: 100 })),
    appearance: { skin: "default", accessories: [], customColor: null },
  }
}

function availableAgents(): MoltbotAgent[] {
  const registered = listRegisteredAgents({ status: "active" }).concat(listRegisteredAgents({ status: "idle" }))
  return registered.length > 0 ? registered.map(registeredAgentToMoltbot) : createAgents().filter((agent) => agent.status !== "offline" && agent.status !== "error")
}

function scoreAgent(agent: MoltbotAgent, task: PlannedTask): number {
  const capability = task.capability.toLowerCase()
  const skillScore = agent.skills.some((skill) => skill.name.toLowerCase().includes(capability) || capability.includes(skill.name.toLowerCase())) ? 100 : 0
  const districtScore = task.district && agent.district === task.district ? 25 : 0
  const availabilityScore = agent.status === "idle" ? 15 : agent.status === "active" ? 10 : 0
  const loadScore = Math.max(0, 10 - Math.floor(agent.cpu / 10))
  return skillScore + districtScore + availabilityScore + loadScore + (agent.tasksCompleted / 100)
}

function matchAgent(task: PlannedTask, agents: MoltbotAgent[]): MoltbotAgent {
  return [...agents].sort((a, b) => scoreAgent(b, task) - scoreAgent(a, task))[0]
}

export async function orchestrateWorkflow(input: OrchestrateInput): Promise<{ runId: string; plan: OrchestrationPlanStep[]; totalEstimatedCost: string; run: OrchestrationRun; planner: string }> {
  const planned = await planWorkflow(input)
  const agents = availableAgents()
  if (agents.length === 0) throw new Error("no available agents")

  const total = planned.plan.reduce((sum, task) => sum + task.estimatedCostXlm, 0)
  if (total > planned.budget.maxXLM) throw new Error(`estimated cost ${toCost(total)} XLM exceeds budget ${planned.budget.maxXLM.toFixed(2)} XLM`)

  const runId = `run_${Date.now().toString(36)}`
  const now = new Date().toISOString()
  const apiPlan: OrchestrationPlanStep[] = []
  const runSteps: RunStep[] = []

  planned.plan.forEach((task) => {
    const agent = matchAgent(task, agents)
    const queueTask = enqueueTask({
      type: "orchestrator.step",
      targetAgentId: agent.id,
      targetDistrict: agent.district,
      targetCapability: task.capability,
      priority: "normal",
      payload: { runId, step: task.step, goal: planned.goal, task: task.task, dep: task.dep ?? [], deadline: planned.deadline },
    })

    publishSystemEvent({ type: "task.started", agentId: agent.id, task: { id: queueTask.id, title: task.task, district: agent.district } })

    apiPlan.push({ step: task.step, agent: agent.name, task: task.task, ...(task.dep?.length ? { dep: task.dep } : {}), estimatedCost: `${toCost(task.estimatedCostXlm)} XLM`, queueTaskId: queueTask.id })
    runSteps.push({
      id: `${runId}_step_${String(task.step).padStart(2, "0")}`,
      runId,
      agentId: agent.id,
      agentName: agent.name,
      task: task.task,
      status: task.step === 1 ? "running" : "queued",
      input: { goal: planned.goal, capability: task.capability, queueTaskId: queueTask.id, deadline: planned.deadline },
      logs: [`planned by ${planned.planner}`, `queued task ${queueTask.id}`, `x402 charge reserved: ${toCost(task.estimatedCostXlm)} XLM`],
      costXlm: toCost(task.estimatedCostXlm),
      dependsOn: task.dep?.[0] ? `${runId}_step_${String(task.dep[0]).padStart(2, "0")}` : undefined,
      receiptId: `x402_${runId}_${task.step}`,
    })
  })

  const run: OrchestrationRun = { id: runId, goal: planned.goal, status: "running", totalCostXlm: toCost(total), startedAt: now, steps: runSteps }
  addOrchestrationRun(run)

  return { runId, plan: apiPlan, totalEstimatedCost: `${toCost(total)} XLM`, run, planner: planned.planner }
}
