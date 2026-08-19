import {
  encodeSseComment,
  encodeSseEvent,
  eventMatchesAgent,
  subscribeToSystemEvents,
} from "@/lib/events/system-events";

const encoder = new TextEncoder();

export function eventStreamHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

export function createSystemEventStream(agentId?: string) {
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };

      write(
        encodeSseComment(
          agentId
            ? `open-stellar events for ${agentId}`
            : "open-stellar events",
        ),
      );

      const unsubscribe = subscribeToSystemEvents((event) => {
        if (eventMatchesAgent(event, agentId)) {
          write(encodeSseEvent(event));
        }
      });

      const keepalive = setInterval(() => {
        write(encodeSseComment(`keepalive ${new Date().toISOString()}`));
      }, 15000);

      cleanup = () => {
        clearInterval(keepalive);
        unsubscribe();
      };
    },
    cancel() {
      cleanup();
    },
  });

  return stream;
}

export function createSystemEventResponse(agentId?: string) {
  return new Response(createSystemEventStream(agentId), {
    status: 200,
    headers: eventStreamHeaders(),
  });
}
