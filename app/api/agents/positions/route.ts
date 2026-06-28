import {
  createAgentPositionSnapshotEvent,
  subscribeAgentPositionDeltas,
  listAgentPositions,
  type AgentPositionDeltaEvent,
  type AgentPositionSnapshotEvent,
} from "@/lib/agents/agent-position-store"
import { eventStreamHeaders } from "@/lib/events/event-stream"
import { clusterPositions } from "@/lib/agents/position-cluster"

export const dynamic = "force-dynamic"

const encoder = new TextEncoder()
const RECONNECT_RETRY_MS = 3000

function encodeSseEvent(event: any): string {
  const lines = [
    `event: ${event.type}`,
    `data: ${JSON.stringify(event)}`,
    "",
    "",
  ]

  if (event.id) {
    lines.unshift(`id: ${event.id}`)
  }

  return lines.join("\n")
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const cluster = url.searchParams.get("cluster") === "true"
  const gridSize = Number(url.searchParams.get("gridSize")) || 5

  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk))
      }

      write([
        `retry: ${RECONNECT_RETRY_MS}\n\n`,
        ": open-stellar agent positions\n\n",
      ].join(""))

      if (cluster) {
        const positions = listAgentPositions()
        const clustered = clusterPositions(positions, gridSize)
        write(encodeSseEvent({
          type: "agent.positions.clustered.snapshot",
          positions: clustered
        }))

        const unsubscribe = subscribeAgentPositionDeltas(() => {
          // Send a new full clustered snapshot whenever a position updates
          // because clustering changes globally
          const currentPositions = listAgentPositions()
          const currentClustered = clusterPositions(currentPositions, gridSize)
          write(encodeSseEvent({
            type: "agent.positions.clustered",
            positions: currentClustered
          }))
        })

        cleanup = () => {
          unsubscribe()
        }
      } else {
        write(encodeSseEvent(createAgentPositionSnapshotEvent()))

        const unsubscribe = subscribeAgentPositionDeltas((event) => {
          write(encodeSseEvent(event))
        })

        cleanup = () => {
          unsubscribe()
        }
      }

      const keepalive = setInterval(() => {
        write(`: keepalive ${new Date().toISOString()}\n\n`)
      }, 15000)

      const oldCleanup = cleanup
      cleanup = () => {
        clearInterval(keepalive)
        oldCleanup()
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
