import { describe, expect, it } from "vitest"
import { buildSevenDayXpSnapshots, getLevelProgress } from "./xp-history-chart"

describe("XP history chart helpers", () => {
  it("pads agents with fewer than seven days of history with zeros", () => {
    const snapshots = buildSevenDayXpSnapshots(
      [
        { type: "earned", delta: 25, timestamp: "2026-06-28T12:00:00.000Z" },
        { type: "earned", delta: 10, timestamp: "2026-06-30T08:00:00.000Z" },
      ],
      new Date("2026-06-30T18:00:00.000Z"),
    )

    expect(snapshots).toHaveLength(7)
    expect(snapshots.map((point) => point.date)).toEqual([
      "2026-06-24",
      "2026-06-25",
      "2026-06-26",
      "2026-06-27",
      "2026-06-28",
      "2026-06-29",
      "2026-06-30",
    ])
    expect(snapshots.map((point) => point.xp)).toEqual([0, 0, 0, 0, 25, 0, 10])
  })

  it("aggregates exactly seven daily earned XP data points", () => {
    const snapshots = buildSevenDayXpSnapshots(
      [
        { type: "earned", delta: 1, timestamp: "2026-06-24T00:00:00.000Z" },
        { type: "earned", delta: 2, timestamp: "2026-06-25T00:00:00.000Z" },
        { type: "earned", delta: 3, timestamp: "2026-06-26T00:00:00.000Z" },
        { type: "earned", delta: 4, timestamp: "2026-06-27T00:00:00.000Z" },
        { type: "earned", delta: 5, timestamp: "2026-06-28T00:00:00.000Z" },
        { type: "earned", delta: 6, timestamp: "2026-06-29T00:00:00.000Z" },
        { type: "earned", delta: 7, timestamp: "2026-06-30T00:00:00.000Z" },
        { type: "decayed", delta: -100, timestamp: "2026-06-30T01:00:00.000Z" },
      ],
      new Date("2026-06-30T18:00:00.000Z"),
    )

    expect(snapshots.map((point) => point.xp)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("calculates bounded level progress", () => {
    expect(getLevelProgress(50, 1).progressPercent).toBe(50)
    expect(getLevelProgress(999999, 1).progressPercent).toBe(100)
  })
})
