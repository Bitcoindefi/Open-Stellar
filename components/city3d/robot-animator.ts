import { AnimationMixer, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from "three"
import { CLIP_CROSSFADE, type RobotAnimMode } from "@/lib/city3d/robot-animation"

/**
 * One skinned robot's clips: an AnimationMixer bound to the robot's own
 * skeleton clone, a Walk and an Idle action, and cross-fades between them.
 * The robot layer advances every animator from a single useFrame.
 */
export class RobotAnimator {
  readonly mixer: AnimationMixer
  private readonly walk: AnimationAction
  private readonly idle: AnimationAction
  private current: AnimationAction | null = null
  private mode: RobotAnimMode | null = null

  constructor(root: Object3D, clips: { walk: AnimationClip; idle: AnimationClip }, phase: number) {
    this.mixer = new AnimationMixer(root)
    this.walk = this.mixer.clipAction(clips.walk).setLoop(LoopRepeat, Infinity)
    this.idle = this.mixer.clipAction(clips.idle).setLoop(LoopRepeat, Infinity)
    // Each robot starts its loops somewhere else, so a district never moves in lockstep.
    this.walk.time = phase * clips.walk.duration
    this.idle.time = phase * clips.idle.duration
  }

  /** True while the clock should run (walk or idle). */
  get running(): boolean {
    return this.mode === "walk" || this.mode === "idle"
  }

  /**
   * Switches clips: walk and idle cross-fade (unless `instant`), still freezes
   * the idle pose at its first frame. `walkScale` sets the walk cycle speed.
   */
  setMode(mode: RobotAnimMode, walkScale: number, instant = false): void {
    this.walk.timeScale = walkScale
    if (mode === this.mode) return
    const previous = this.mode
    this.mode = mode
    if (mode === "still") {
      this.mixer.stopAllAction()
      this.current = this.idle
      this.idle.reset().play()
      this.mixer.update(0)
      return
    }
    const next = mode === "walk" ? this.walk : this.idle
    const from = this.current
    this.current = next
    next.enabled = true
    next.setEffectiveWeight(1)
    next.play()
    if (from && from !== next && previous !== "still" && !instant) {
      from.crossFadeTo(next, CLIP_CROSSFADE, false)
    } else if (from && from !== next) {
      from.stop()
    }
    // Apply the pose now, so a robot is never drawn in its bind pose for a frame.
    this.mixer.update(0)
  }

  update(dt: number): void {
    this.mixer.update(dt)
  }

  /** Stops and forgets every action; the animator is not used again afterwards. */
  dispose(): void {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.mixer.getRoot())
  }
}

/** Every mounted skinned robot, advanced together once per frame. */
export class RobotAnimatorSet {
  private readonly animators = new Set<RobotAnimator>()

  add(animator: RobotAnimator): void {
    this.animators.add(animator)
  }

  delete(animator: RobotAnimator): void {
    this.animators.delete(animator)
  }

  get size(): number {
    return this.animators.size
  }

  /** Advances the running mixers by `dt` seconds (no allocation, frozen robots skipped). */
  update(dt: number): void {
    if (!(dt > 0)) return
    for (const animator of this.animators) {
      if (animator.running) animator.update(dt)
    }
  }
}
