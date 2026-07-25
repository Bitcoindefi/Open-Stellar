import { NextResponse } from "next/server"
import { getRegisteredAgent } from "@/lib/agent-registry"
import { satisfies } from "semver"

export const revalidate = 30

interface RouteContext {
  params: Promise<{ id: string }>
}

interface SkillCompatResult {
  id: string
  version: string
  compatible: boolean
  requires?: string
}

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params
  const agentId = decodeURIComponent(id)

  const agent = getRegisteredAgent(agentId)
  if (!agent) {
    return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 })
  }

  const url = new URL(req.url)
  const callerVersion = url.searchParams.get("callerVersion")

  if (!callerVersion) {
    return NextResponse.json(
      { ok: false, error: "callerVersion query parameter is required" },
      { status: 400 },
    )
  }

  const skillVersions = agent.skillVersions ?? []
  const skills: SkillCompatResult[] = agent.capabilities.map((cap) => {
    const skillVersion = skillVersions.find((sv) => sv.id === cap)
    const version = skillVersion?.version ?? "1.0.0"
    const minCallerVersion = skillVersion?.minCallerVersion

    if (!minCallerVersion) {
      return { id: cap, version, compatible: true }
    }

    const compatible = satisfies(callerVersion, minCallerVersion)

    return {
      id: cap,
      version,
      compatible,
      ...(compatible ? {} : { requires: minCallerVersion }),
    }
  })

  const allCompatible = skills.every((s) => s.compatible)

  return NextResponse.json({
    compatible: allCompatible,
    skills,
  })
}