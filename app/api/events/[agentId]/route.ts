import { createSystemEventResponse } from "@/lib/events/event-stream";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const params = await context.params;
  return createSystemEventResponse(params.agentId);
}
