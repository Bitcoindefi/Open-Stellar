import { describe, expect, it } from "vitest"
import { PAYMENT_ASSET, publicNetworkLabel } from "@/lib/config/chains"
import { feedEventFromSystemEvent, listFeedEvents } from "@/lib/feed/activity-feed"

describe("activity feed chain copy", () => {
  it("labels seeded payments with the public asset and network", () => {
    const payments = listFeedEvents({ kind: "payment" })
    const text = payments.map((event) => `${event.title} ${event.detail}`).join("\n")

    expect(text).toContain(PAYMENT_ASSET)
    expect(text).toContain(publicNetworkLabel())
    expect(text).not.toContain("Stellar testnet")
  })

  it("falls back to the product name when the agent has no district", () => {
    const event = feedEventFromSystemEvent({
      id: "evt_unknown_agent",
      type: "agent.xp",
      agentId: "unknown-agent",
      xp: 10,
      level: 2,
      occurredAt: "2026-06-24T00:00:00.000Z",
    })

    expect(event.detail).toBe("+10 XP earned in Agentic City")
    expect(event.shareText).toContain("on Agentic City")
  })

  it("omits the asset when a quest reward has no token amount", () => {
    const event = feedEventFromSystemEvent({
      id: "quest-no-token",
      type: "quest.completed",
      agentId: "bot-0",
      questId: "daily-complete-5-tasks",
      reward: { xp: 20 },
      occurredAt: "2026-06-24T00:00:00.000Z",
    })

    expect(event.detail).toBe("+20 XP")
    expect(event.detail).not.toContain(PAYMENT_ASSET)
  })
})
