import Link from "next/link"
import { LiveFeed } from "@/components/feed/live-feed"
import { NotificationOptIn } from "@/components/feed/notification-opt-in"
import { DISTRICTS } from "@/lib/data"
import { FEED_FILTERS, feedDistrictName, isDistrictId, isFeedEventKind, listFeedEvents, type FeedEventKind } from "@/lib/feed/activity-feed"
import type { DistrictId } from "@/lib/types"

type FeedPageProps = {
  searchParams: Promise<{
    kind?: FeedEventKind | "all"
    district?: DistrictId | "all"
    agent?: string
  }>
}

export const metadata = {
  title: "Global Activity Feed | Open Stellar",
  description: "A public stream of notable Open Stellar agent payments, badges, level-ups, tasks, and district events.",
}

function filterHref(kind: string, district?: string, agent?: string) {
  const params = new URLSearchParams()
  if (kind && kind !== "all") params.set("kind", kind)
  if (district && district !== "all") params.set("district", district)
  if (agent) params.set("agent", agent)
  const query = params.toString()
  return query ? `/feed?${query}` : "/feed"
}

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const params = await searchParams
  const activeKind = isFeedEventKind(params.kind) ? params.kind : "all"
  const activeDistrict = isDistrictId(params.district) ? params.district : "all"
  const events = listFeedEvents({
    kind: activeKind,
    district: activeDistrict,
    agent: params.agent,
  })

  const streamParams = new URLSearchParams({ stream: "1" })
  if (activeDistrict !== "all") streamParams.set("district", activeDistrict)
  if (params.agent) streamParams.set("agent", params.agent)

  return (
    <main style={{ minHeight: "100vh", background: "#030712", color: "#e2e8f0", padding: "32px 18px", fontFamily: "monospace" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#67e8f9", fontSize: 12, textDecoration: "none" }}>
          {"<- Back to city"}
        </Link>

        <section style={{ marginTop: 28, display: "grid", gap: 18 }}>
          <div>
            <p style={{ color: "#22d3ee", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>
              Public social layer
            </p>
            <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: "10px 0 12px" }}>Global Activity Feed</h1>
            <p style={{ color: "#94a3b8", lineHeight: 1.7, maxWidth: 720, margin: 0 }}>
              Live-friendly stream of notable Open Stellar events across agents, payments, badges, levels, tasks, and districts.
            </p>
          </div>

          <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }} aria-label="Feed event filters">
            {FEED_FILTERS.map((filter) => (
              <Link
                key={filter.id}
                href={filterHref(filter.id ?? "all", activeDistrict, params.agent)}
                style={{
                  border: "1px solid #1f2a44",
                  borderRadius: 6,
                  background: activeKind === filter.id ? "#22d3ee22" : "#0f172a",
                  color: activeKind === filter.id ? "#67e8f9" : "#94a3b8",
                  padding: "8px 10px",
                  fontSize: 11,
                  textDecoration: "none",
                }}
              >
                {filter.label}
              </Link>
            ))}
          </nav>

          <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }} aria-label="Feed district filters">
            <Link
              href={filterHref(activeKind, "all", params.agent)}
              style={{
                border: "1px solid #1f2a44",
                borderRadius: 6,
                background: activeDistrict === "all" ? "#334155" : "#0f172a",
                color: "#cbd5e1",
                padding: "7px 9px",
                fontSize: 10,
                textDecoration: "none",
              }}
            >
              All districts
            </Link>
            {DISTRICTS.map((district) => (
              <Link
                key={district.id}
                href={filterHref(activeKind, district.id, params.agent)}
                style={{
                  border: `1px solid ${district.color}55`,
                  borderRadius: 6,
                  background: activeDistrict === district.id ? `${district.color}22` : "#0f172a",
                  color: activeDistrict === district.id ? district.color : "#94a3b8",
                  padding: "7px 9px",
                  fontSize: 10,
                  textDecoration: "none",
                }}
              >
                {district.name}
              </Link>
            ))}
          </nav>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: 16, alignItems: "start" }}>
            <LiveFeed initialEvents={events} streamPath={`/api/feed?${streamParams.toString()}`} />

            <aside style={{ display: "grid", gap: 12 }} aria-label={`Feed controls for ${feedDistrictName(activeDistrict === "all" ? undefined : activeDistrict)}`}>
              <section style={{ border: "1px solid #1f2a44", borderRadius: 8, background: "#0f172a", padding: 16 }}>
                <h2 style={{ margin: "0 0 10px", color: "#e2e8f0", fontSize: 16 }}>Embed</h2>
                <p style={{ margin: "0 0 12px", color: "#94a3b8", fontSize: 12, lineHeight: 1.6 }}>
                  Add a compact live-ready feed to external operator sites.
                </p>
                <pre style={{ whiteSpace: "pre-wrap", color: "#67e8f9", background: "#020617", border: "1px solid #1f2a44", borderRadius: 6, padding: 10, fontSize: 10, lineHeight: 1.5 }}>
{`<script src="/embed/feed.js"></script>
<open-stellar-feed district="data-center" limit="5"></open-stellar-feed>`}
                </pre>
                <p style={{ margin: "12px 0 0", color: "#64748b", fontSize: 11, lineHeight: 1.6 }}>
                  JSON API: <code>/api/feed?kind=payment&amp;limit=5</code><br />
                  SSE stream: <code>/api/feed?stream=1</code>
                </p>
              </section>
              <NotificationOptIn />
            </aside>
          </div>
        </section>
      </div>
    </main>
  )
}
