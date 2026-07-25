import {
  createAgentPositionSnapshotEvent,
  subscribeAgentPositionDeltas,
  type AgentPositionDeltaEvent,
  type AgentPositionSnapshotEvent,
} from "@/lib/agents/agent-position-store"
import { eventStreamHeaders } from "@/lib/events/event-stream"

export const dynamic = "force-dynamic"

const encoder = new TextEncoder()
const RECONNECT_RETRY_MS = 3000

function encodeSseEvent(event: AgentPositionDeltaEvent | AgentPositionSnapshotEvent): string {
  const lines = [
    `event: ${event.type}`,
    `data: ${JSON.stringify(event)}`,
    "",
    "",
  ]

  if ("id" in event) {
    lines.unshift(`id: ${event.id}`)
  }

  return lines.join("\n")
}

export async function GET() {
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk))
      }

      write([
        `retry: ${RECONNECT_RETRY_MS}\n\n`,
        ": open-stellar agent positions\n\n",
        encodeSseEvent(createAgentPositionSnapshotEvent()),
      ].join(""))

      const unsubscribe = subscribeAgentPositionDeltas((event) => {
        write(encodeSseEvent(event))
      })

      const keepalive = setInterval(() => {
        write(`: keepalive ${new Date().toISOString()}\n\n`)
      }, 15000)

      cleanup = () => {
        clearInterval(keepalive)
        unsubscribe()
      }
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: eventStreamHeaders(),
  })
}
