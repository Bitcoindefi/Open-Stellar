import { NextResponse } from "next/server";
import { recordAgentHeartbeat } from "@/lib/agents/agent-health-store";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const health = recordAgentHeartbeat(decodeURIComponent(id), {
      status: body.status,
      cpu: body.cpu,
      memory: body.memory,
      currentTask: body.currentTask,
      autoRestart: body.autoRestart,
    });

    return NextResponse.json(
      { ok: true, health },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed recording agent heartbeat",
      },
      { status: 400 },
    );
  }
}
