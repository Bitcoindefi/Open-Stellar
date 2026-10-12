import { describe, expect, it } from "vitest"
import {
  LABEL_LIFT_STEP,
  STATUS_COLORS,
  STATUS_SYMBOLS,
  bobOffset,
  computeDistrictFocus,
  errorPulse,
  getLabelLifts,
  getRobotMotion,
  getStatusColor,
  resolveRobotAccent,
  sameRobotLook,
} from "./robot-state"

describe("getRobotMotion", () => {
  it("walks while working, like the 2D walk cycle", () => {
    expect(getRobotMotion("working")).toEqual({ walk: true, bob: true, dim: false, alert: false, pulse: false })
    expect(getRobotMotion("running").walk).toBe(true)
    expect(getRobotMotion("active").walk).toBe(true)
  })

  it("stands still but stays alive when idle", () => {
    expect(getRobotMotion("idle")).toEqual({ walk: false, bob: true, dim: false, alert: false, pulse: false })
    expect(getRobotMotion("degraded").walk).toBe(false)
  })

  it("powers down offline and stopped robots", () => {
    expect(getRobotMotion("offline")).toEqual({ walk: false, bob: false, dim: true, alert: false, pulse: false })
    expect(getRobotMotion("stopped").dim).toBe(true)
  })

  it("flags errors with a pulse", () => {
    expect(getRobotMotion("error")).toEqual({ walk: false, bob: false, dim: false, alert: true, pulse: true })
  })

  it("drops every movement under reduced motion", () => {
    expect(getRobotMotion("working", true)).toEqual({ walk: false, bob: false, dim: false, alert: false, pulse: false })
    expect(getRobotMotion("error", true)).toEqual({ walk: false, bob: false, dim: false, alert: true, pulse: false })
  })
})

describe("errorPulse / bobOffset", () => {
  it("pulses between 0 and 1", () => {
    for (let t = 0; t < 3; t += 0.07) {
      const v = errorPulse(t)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(errorPulse(0)).toBeCloseTo(0.5)
    expect(errorPulse(Number.NaN)).toBe(1)
  })

  it("bobs a little, more while walking", () => {
    for (let t = 0; t < 3; t += 0.05) {
      expect(bobOffset(t, false)).toBeGreaterThanOrEqual(0)
      expect(bobOffset(t, false)).toBeLessThanOrEqual(0.05 + 1e-9)
      expect(bobOffset(t, true, 1)).toBeLessThanOrEqual(0.06 + 1e-9)
    }
    expect(bobOffset(Number.NaN, true)).toBe(0)
  })
})

describe("resolveRobotAccent", () => {
  it("uses the agent color when it has a hue", () => {
    expect(resolveRobotAccent("#f472b6", "#22d3ee")).toBe("#f472b6")
    expect(resolveRobotAccent(" #60a5fa ", "#22d3ee")).toBe("#60a5fa")
  })

  it("keeps the district color for grays and invalid colors", () => {
    expect(resolveRobotAccent("#9ca3af", "#22d3ee")).toBe("#22d3ee")
    expect(resolveRobotAccent("purple", "#22d3ee")).toBe("#22d3ee")
    expect(resolveRobotAccent(null, "#22d3ee")).toBe("#22d3ee")
  })
})

describe("status colors and symbols", () => {
  it("matches the 2D palette and falls back to slate", () => {
    expect(getStatusColor("working")).toBe(STATUS_COLORS.working)
    expect(getStatusColor("mystery")).toBe("#64748b")
    expect(STATUS_SYMBOLS.error).toBeTruthy()
  })
})

describe("sameRobotLook", () => {
  const agent = {
    id: "bot-1",
    name: "Cipher-3",
    status: "working",
    color: "#34d399",
    district: "comm-hub",
    cpu: 41.2,
    currentTask: "Routing messages",
  }

  it("ignores CPU drift and task changes while the label is collapsed", () => {
    expect(sameRobotLook(agent, agent, false)).toBe(true)
    expect(sameRobotLook(agent, { ...agent, cpu: 77, currentTask: "Relaying signals" }, false)).toBe(true)
  })

  it("re-renders for anything the robot shows", () => {
    expect(sameRobotLook(agent, { ...agent, status: "idle" }, false)).toBe(false)
    expect(sameRobotLook(agent, { ...agent, color: "#f87171" }, false)).toBe(false)
    expect(sameRobotLook(agent, { ...agent, name: "Cipher-4" }, false)).toBe(false)
    expect(sameRobotLook(agent, { ...agent, district: "research" }, false)).toBe(false)
    expect(sameRobotLook(agent, { ...agent, id: "bot-2" }, false)).toBe(false)
  })

  it("tracks rounded CPU and the task while the label is expanded", () => {
    expect(sameRobotLook(agent, { ...agent, cpu: 41.4 }, true)).toBe(true)
    expect(sameRobotLook(agent, { ...agent, cpu: 42 }, true)).toBe(false)
    expect(sameRobotLook(agent, { ...agent, currentTask: null }, true)).toBe(false)
    expect(sameRobotLook(agent, { ...agent, status: "error" }, true)).toBe(false)
  })
})

describe("getLabelLifts", () => {
  it("staggers labels of robots sharing a district", () => {
    const lifts = getLabelLifts([
      { id: "bot-10", district: "processing" },
      { id: "bot-2", district: "processing" },
      { id: "bot-7", district: "processing" },
      { id: "bot-12", district: "processing" },
      { id: "bot-1", district: "comm-hub" },
    ])
    expect(lifts.get("bot-2")).toBe(0)
    expect(lifts.get("bot-7")).toBe(LABEL_LIFT_STEP)
    expect(lifts.get("bot-10")).toBe(LABEL_LIFT_STEP * 2)
    expect(lifts.get("bot-12")).toBe(0) // wraps after three levels
    expect(lifts.get("bot-1")).toBe(0)
  })

  it("supports a custom step and at least one level", () => {
    const lifts = getLabelLifts(
      [
        { id: "a", district: "x" },
        { id: "b", district: "x" },
      ],
      1,
      0,
    )
    expect(lifts.get("a")).toBe(0)
    expect(lifts.get("b")).toBe(0)
  })
})

describe("computeDistrictFocus", () => {
  it("weights busy districts higher and keeps a floor", () => {
    const volumes = computeDistrictFocus(
      [
        { district: "data-center", status: "working" },
        { district: "data-center", status: "idle" },
        { district: "comm-hub", status: "idle" },
        { district: "processing", status: "offline" },
        { district: "elsewhere", status: "working" },
      ],
      ["data-center", "comm-hub", "processing"],
    )
    expect(volumes.get("data-center")).toBeCloseTo(1)
    expect(volumes.get("comm-hub")).toBeCloseTo(0.18 + 0.82 / 2.5)
    expect(volumes.get("processing")).toBeCloseTo(0.18)
  })

  it("handles an empty city", () => {
    expect(computeDistrictFocus([], ["a"]).get("a")).toBeCloseTo(0.18)
  })
})
