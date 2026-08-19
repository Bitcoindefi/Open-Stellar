import { ImageResponse } from "next/og";
import { DistrictCardOG } from "@/components/og/agent-card-og";
import {
  AGENT_OG_SIZE,
  DISTRICT_BACKGROUND_PATHS,
  findDistrictByLookup,
  getAgentsForDistrict,
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
  const district = findDistrictByLookup(id);

  if (!district) {
    return new Response("District not found", { status: 404 });
  }

  const origin = new URL(request.url).origin;

  return new ImageResponse(
    <DistrictCardOG
      district={district}
      agents={getAgentsForDistrict(district.id)}
      backgroundUrl={absoluteUrl(
        DISTRICT_BACKGROUND_PATHS[district.id],
        origin,
      )}
    />,
    AGENT_OG_SIZE,
  );
}
