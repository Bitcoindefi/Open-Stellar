"use client"

export type TaskOfferStatus = "open" | "claimed" | "delivered" | "accepted"

export interface TaskOffer {
  id: string
  title: string
  requiredCapability: string
  rewardAmount: number
  rewardAsset: string
  deadline: string
  status: TaskOfferStatus
  posterAgentId: string
  workerAgentId?: string | null
  payload: Record<string, unknown>
}

interface TaskOfferSheetProps {
  offer: TaskOffer | null
  viewerAgentId?: string | null
  onClose: () => void
}

const STATUS_ORDER: TaskOfferStatus[] = ["open", "claimed", "delivered", "accepted"]

function formatJson(payload: Record<string, unknown>) {
  return JSON.stringify(payload, null, 2)
}

export function TaskOfferSheet({ offer, viewerAgentId, onClose }: TaskOfferSheetProps) {
  if (!offer) return null

  const currentIndex = STATUS_ORDER.indexOf(offer.status)
  const canClaim = offer.status === "open" && Boolean(viewerAgentId) && viewerAgentId !== offer.posterAgentId

  return (
    <div
      role="dialog"
      aria-label={`Task offer ${offer.title}`}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        display: "flex",
        justifyContent: "flex-end",
        background: "rgba(2, 6, 23, 0.62)",
      }}
    >
      <section
        style={{
          width: "92%",
          maxWidth: 300,
          height: "100%",
          overflow: "auto",
          borderLeft: "1px solid #334155",
          background: "#0f172a",
          boxShadow: "-18px 0 40px rgba(0,0,0,0.35)",
          padding: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: "#22d3ee", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1 }}>
              Offer detail
            </div>
            <h3 style={{ margin: "5px 0 0", fontSize: 15, lineHeight: 1.25, color: "#e2e8f0" }}>{offer.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task offer detail"
            style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}
          >
            x
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
          <div style={{ border: "1px solid #1e293b", borderRadius: 6, padding: 8, background: "#111827" }}>
            <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Capability</div>
            <div style={{ marginTop: 4, color: "#67e8f9", fontSize: 12, fontFamily: "monospace" }}>{offer.requiredCapability}</div>
          </div>
          <div style={{ border: "1px solid #1e293b", borderRadius: 6, padding: 8, background: "#111827" }}>
            <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Reward</div>
            <div style={{ marginTop: 4, color: "#fbbf24", fontSize: 12, fontFamily: "monospace" }}>
              {offer.rewardAmount} {offer.rewardAsset}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Status timeline
          </div>
          <div style={{ display: "grid", gap: 7 }}>
            {STATUS_ORDER.map((status, index) => {
              const reached = index <= currentIndex
              return (
                <div key={status} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: reached ? "#34d399" : "#334155",
                      boxShadow: reached ? "0 0 12px rgba(52, 211, 153, 0.45)" : "none",
                    }}
                  />
                  <span style={{ color: reached ? "#d1fae5" : "#64748b", fontSize: 11, fontFamily: "monospace", textTransform: "uppercase" }}>
                    {status}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <details style={{ marginTop: 14 }} open={false}>
          <summary style={{ cursor: "pointer", color: "#94a3b8", fontSize: 11, fontFamily: "monospace" }}>
            Payload preview
          </summary>
          <pre
            style={{
              marginTop: 8,
              maxHeight: 220,
              overflow: "auto",
              border: "1px solid #1e293b",
              borderRadius: 6,
              padding: 8,
              background: "#020617",
              color: "#cbd5e1",
              fontSize: 10,
              lineHeight: 1.45,
              whiteSpace: "pre-wrap",
            }}
          >
            {formatJson(offer.payload)}
          </pre>
        </details>

        {canClaim && (
          <button
            type="button"
            style={{
              width: "100%",
              marginTop: 14,
              minHeight: 34,
              borderRadius: 6,
              border: "1px solid #22d3ee",
              background: "#0e7490",
              color: "#ecfeff",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            Claim this offer
          </button>
        )}
      </section>
    </div>
  )
}
