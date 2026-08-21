import { createApiRouteLogger } from "@/lib/api-logging";
import { resolveTrack8004 } from "@/lib/protocols/track8004";

export async function GET(req: Request) {
  const api = createApiRouteLogger(req, "/api/protocol/track8004");
  const { searchParams } = new URL(req.url);
  const chain = searchParams.get("chain") === "stellar" ? "stellar" : "bnb";
  const stellarSupports8004 =
    searchParams.get("stellarSupports8004") === "true";

  const resolution = resolveTrack8004(chain, stellarSupports8004);

  return await api.json({ ok: true, resolution }, undefined, {
    event: "track8004.resolved",
    chain,
    stellarSupports8004,
    mode: resolution.mode,
  });
}
