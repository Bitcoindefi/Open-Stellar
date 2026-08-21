import { NextResponse } from "next/server";
import {
  listAgentHealth,
  listAgentHealthEvents,
  runAgentHealthCheck,
} from "@/lib/agents/agent-health-store";

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized cron request" },
      { status: 401 },
    );
  }

  const result = runAgentHealthCheck();

  return NextResponse.json(
    {
      ok: true,
      ...result,
      agents: listAgentHealth(),
      recentEvents: listAgentHealthEvents(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
