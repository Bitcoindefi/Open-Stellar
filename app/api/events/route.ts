import { createSystemEventResponse } from "@/lib/events/event-stream";

export const dynamic = "force-dynamic";

export async function GET() {
  return createSystemEventResponse();
}
