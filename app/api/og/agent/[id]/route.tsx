import { ImageResponse } from "next/og";
import { AgentCardOG } from "@/components/og/agent-card-og";
import {
  AGENT_OG_SIZE,
  DISTRICT_BACKGROUND_PATHS,
  findAgentByLookup,
  getAgentCardStats,
  getAgentDistrict,
  getAgentProfilePath,
  getAgentSpritePath,
} from "@/lib/og-card-data";

export const runtime = "edge";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function absoluteUrl(path: string, origin: string): string {
  return new URL(path, origin).toString();
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const agent = findAgentByLookup(id);

  if (!agent) {
    return new Response("Agent not found", { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const district = getAgentDistrict(agent);

  return new ImageResponse(
    <AgentCardOG
      agent={agent}
      district={district}
      stats={getAgentCardStats(agent)}
      profileUrl={absoluteUrl(getAgentProfilePath(agent), origin)}
      backgroundUrl={absoluteUrl(
        DISTRICT_BACKGROUND_PATHS[district.id],
        origin,
      )}
      spriteUrl={absoluteUrl(getAgentSpritePath(agent), origin)}
    />,
    AGENT_OG_SIZE,
  );
}
