import { describe, expect, it } from "vitest"
import { getTaskOfferCounts, type TaskOffer } from "@/components/task-board"

describe("getTaskOfferCounts", () => {
  it("counts posted offers and completed filled offers for an agent", () => {
    const offers: TaskOffer[] = [
      {
        id: "posted-open",
        title: "Open task",
        requiredCapability: "Log Analysis",
        rewardAmount: 10,
        rewardAsset: "XLM",
        deadline: "2026-06-26T12:00:00.000Z",
        status: "open",
        posterAgentId: "bot-1",
        payload: {},
      },
      {
        id: "filled-delivered",
        title: "Delivered task",
        requiredCapability: "Data Mining",
        rewardAmount: 12,
        rewardAsset: "XLM",
        deadline: "2026-06-26T13:00:00.000Z",
        status: "delivered",
        posterAgentId: "bot-2",
        workerAgentId: "bot-1",
        payload: {},
      },
      {
        id: "filled-claimed",
        title: "Claimed task",
        requiredCapability: "Protocol Design",
        rewardAmount: 7,
        rewardAsset: "XLM",
        deadline: "2026-06-26T14:00:00.000Z",
        status: "claimed",
        posterAgentId: "bot-3",
        workerAgentId: "bot-1",
        payload: {},
      },
    ]

    expect(getTaskOfferCounts("bot-1", offers)).toEqual({
      posted: 1,
      filled: 1,
    })
  })
})
