import { createSystemEventStream, eventStreamHeaders } from "@/lib/events/event-stream"
import {
  feedEventFromSystemEvent,
  isDistrictId,
  isFeedEventKind,
  listFeedEvents,
} from "@/lib/feed/activity-feed"
import type { DistrictId } from "@/lib/types"

export const dynamic = "force-dynamic"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function parseLimit(value: string | null) {
  const limit = Number(value ?? 25)
  return Number.isFinite(limit) ? limit : 25
}

function jsonFeed(req: Request) {
  const url = new URL(req.url)
  const kind = url.searchParams.get("kind")
  const district = url.searchParams.get("district")
  const agent = url.searchParams.get("agent") || undefined
  const limit = parseLimit(url.searchParams.get("limit"))
  const events = listFeedEvents({
    kind: isFeedEventKind(kind) ? kind : "all",
    district: isDistrictId(district) ? district : "all",
    agent,
    cursor: url.searchParams.get("cursor") || undefined,
    limit,
  })

  return Response.json(
    {
      events,
      nextCursor: events.at(-1)?.occurredAt ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

function streamFeed(req: Request) {
  const url = new URL(req.url)
  const requestedDistrict = url.searchParams.get("district")
  const district: DistrictId | null = isDistrictId(requestedDistrict) ? requestedDistrict : null
  const baseStream = createSystemEventStream(url.searchParams.get("agent") || undefined)
  let buffer = ""

  const transformed = baseStream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const frames = buffer.split("\n\n")
      buffer = frames.pop() ?? ""

      for (const frame of frames) {
        if (!frame.trim()) continue
        const dataLine = frame.split("\n").find((line) => line.startsWith("data: "))

        if (!dataLine) {
          controller.enqueue(encoder.encode(`${frame}\n\n`))
          continue
        }

        try {
          const raw = JSON.parse(dataLine.slice(6))
          const event = feedEventFromSystemEvent(raw)
          if (district && event.districtId !== district) continue
          controller.enqueue(encoder.encode(`id: ${event.id}\nevent: feed.event\ndata: ${JSON.stringify(event)}\n\n`))
        } catch {
          controller.enqueue(encoder.encode(`${frame}\n\n`))
        }
      }
    },
  }))

  return new Response(transformed, {
    status: 200,
    headers: eventStreamHeaders(),
  })
}

export function GET(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get("stream") === "1") {
    return streamFeed(req)
  }

  return jsonFeed(req)
}
