"use client"

import { useEffect, useMemo, useState } from "react"
import { FeedItem } from "@/components/feed/feed-item"
import type { FeedEvent } from "@/lib/feed/activity-feed"

export function LiveFeed({ initialEvents, streamPath }: { initialEvents: FeedEvent[]; streamPath: string }) {
  const [events, setEvents] = useState(initialEvents)
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    const source = new EventSource(streamPath)

    source.onopen = () => setIsLive(true)
    source.onerror = () => setIsLive(false)
    source.addEventListener("feed.event", (message) => {
      try {
        const event = JSON.parse((message as MessageEvent).data) as FeedEvent
        setEvents((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 25))
      } catch {
        setIsLive(false)
      }
    })

    return () => source.close()
  }, [streamPath])

  const label = useMemo(() => (isLive ? "Live updates connected" : "Waiting for live updates"), [isLive])

  return (
    <section style={{ display: "grid", gap: 10 }} aria-label="Live feed events">
      <div
        aria-live="polite"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: isLive ? "#34d399" : "#94a3b8",
          fontFamily: "monospace",
          fontSize: 11,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: isLive ? "#34d399" : "#64748b",
            boxShadow: isLive ? "0 0 18px #34d399" : "none",
          }}
        />
        {label}
      </div>

      {events.map((event, index) => (
        <div
          key={event.id}
          style={{
            animation: index === 0 ? "feed-slide-in 260ms ease-out" : undefined,
          }}
        >
          <FeedItem event={event} />
        </div>
      ))}

      <style>{`
        @keyframes feed-slide-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  )
}
