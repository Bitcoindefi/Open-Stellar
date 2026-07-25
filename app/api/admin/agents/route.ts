import { NextResponse } from "next/server"
import { cloudConfigToAgent, listCloudAgentConfigs, provisionCloudAgent } from "@/lib/agent-runtime/cloud-agents"
import { isAuthorized } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }
  const configs = listCloudAgentConfigs()
  return NextResponse.json({ ok: true, agents: configs.map((config, index) => cloudConfigToAgent(config, index)), configs }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const config = provisionCloudAgent({ name: body.name, model: body.model, district: body.district, queueMode: body.queueMode }, req)
    return NextResponse.json({ ok: true, config, agent: cloudConfigToAgent(config, listCloudAgentConfigs().length - 1) }, { status: 201, headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed provisioning cloud agent" }, { status: 400 })
  }
}
