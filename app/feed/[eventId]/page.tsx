import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { FeedItem } from "@/components/feed/feed-item"
import { feedEventUrl, getFeedEventById } from "@/lib/feed/activity-feed"

type EventPageProps = {
  params: Promise<{ eventId: string }>
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { eventId } = await params
  const event = getFeedEventById(eventId)

  if (!event) {
    return { title: "Feed event not found - Open Stellar" }
  }

  const url = new URL(feedEventUrl(event), getBaseUrl()).toString()

  return {
    title: `${event.title} | Open Stellar Feed`,
    description: event.detail,
    alternates: { canonical: url },
    openGraph: {
      title: event.title,
      description: event.detail,
      url,
      type: "article",
    },
    twitter: {
      card: "summary",
      title: event.title,
      description: event.detail,
    },
  }
}

export default async function FeedEventPage({ params }: EventPageProps) {
  const { eventId } = await params
  const event = getFeedEventById(eventId)

  if (!event) notFound()

  return (
    <main style={{ minHeight: "100vh", background: "#030712", color: "#e2e8f0", padding: "40px 18px", fontFamily: "monospace" }}>
      <div style={{ maxWidth: 840, margin: "0 auto", display: "grid", gap: 22 }}>
        <Link href="/feed" style={{ color: "#67e8f9", fontSize: 12, textDecoration: "none" }}>
          {"<- Back to feed"}
        </Link>
        <FeedItem event={event} />
        <section style={{ border: "1px solid #1f2a44", borderRadius: 8, background: "#0f172a", padding: 18 }}>
          <h1 style={{ margin: "0 0 10px", fontSize: 24 }}>{event.title}</h1>
          <p style={{ margin: 0, color: "#94a3b8", lineHeight: 1.7 }}>{event.detail}</p>
          <p style={{ margin: "14px 0 0", color: "#64748b", fontSize: 12 }}>
            Event ID: {event.id}
          </p>
        </section>
      </div>
    </main>
  )
}
