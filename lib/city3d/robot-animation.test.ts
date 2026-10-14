import { describe, expect, it } from "vitest"
import { WALK_SPEED } from "./paths"
import { ROBOT_WORLD_HEIGHT } from "./robot-models"
import { getRobotMotion } from "./robot-state"
import { CLIP_CROSSFADE, clipPhase, getRobotAnimMode, walkTimeScale } from "./robot-animation"

describe("robot animation", () => {
  it("walks while working, idles when standing, freezes offline", () => {
    expect(getRobotAnimMode(getRobotMotion("working"), false)).toBe("walk")
    expect(getRobotAnimMode(getRobotMotion("idle"), false)).toBe("idle")
    expect(getRobotAnimMode(getRobotMotion("error"), false)).toBe("idle")
    expect(getRobotAnimMode(getRobotMotion("offline"), false)).toBe("still")
    expect(getRobotAnimMode(getRobotMotion("stopped"), false)).toBe("still")
  })

  it("holds a static pose under reduced motion", () => {
    for (const status of ["working", "running", "idle", "error", "offline"]) {
      expect(getRobotAnimMode(getRobotMotion(status, true), true)).toBe("still")
    }
  })

  it("ties the walk cycle to the robot's ground speed", () => {
    const scale = walkTimeScale(WALK_SPEED, ROBOT_WORLD_HEIGHT)
    expect(scale).toBeGreaterThan(0.75)
    expect(scale).toBeLessThan(1.1)
    expect(walkTimeScale(WALK_SPEED * 2, ROBOT_WORLD_HEIGHT)).toBeCloseTo(scale * 2)
    expect(walkTimeScale(100, 1)).toBe(2)
    expect(walkTimeScale(0.01, 1)).toBe(0.5)
    expect(walkTimeScale(0, 1)).toBe(1)
    expect(walkTimeScale(Number.NaN, 1)).toBe(1)
  })

  it("spreads loop phases over one cycle", () => {
    expect(clipPhase(0)).toBe(0)
    expect(clipPhase(Math.PI)).toBeCloseTo(0.5)
    expect(clipPhase(Math.PI * 5)).toBeCloseTo(0.5)
    expect(clipPhase(-Math.PI / 2)).toBeCloseTo(0.75)
    expect(clipPhase(Number.NaN)).toBe(0)
    expect(CLIP_CROSSFADE).toBeGreaterThan(0)
  })
})
