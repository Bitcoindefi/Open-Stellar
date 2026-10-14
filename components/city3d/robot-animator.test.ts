import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { AnimationClip, Object3D, SkinnedMesh, VectorKeyframeTrack } from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js"
import { IDLE_CLIP, WALK_CLIP } from "@/lib/city3d/robot-animation"
import { ROBOT_MODEL_DISTRICTS } from "@/lib/city3d/robot-models"
import { RobotAnimator, RobotAnimatorSet } from "./robot-animator"
import { createRobotMaterial, mergeSkinnedPrimitives } from "./robot-models"

function rig(): { root: Object3D; part: Object3D; walk: AnimationClip; idle: AnimationClip } {
  const root = new Object3D()
  const part = new Object3D()
  part.name = "part"
  root.add(part)
  const walk = new AnimationClip(WALK_CLIP, 1, [new VectorKeyframeTrack("part.position", [0, 0.5, 1], [0, 0, 0, 1, 0, 0, 0, 0, 0])])
  const idle = new AnimationClip(IDLE_CLIP, 2, [new VectorKeyframeTrack("part.position", [0, 1, 2], [0, 0, 0, 0, 1, 0, 0, 0, 0])])
  return { root, part, walk, idle }
}

describe("RobotAnimator", () => {
  it("plays Walk and Idle, and freezes the idle pose when still", () => {
    const { root, part, walk, idle } = rig()
    const animator = new RobotAnimator(root, { walk, idle }, 0)
    animator.setMode("walk", 1)
    expect(animator.running).toBe(true)
    animator.update(0.25)
    expect(part.position.x).toBeCloseTo(0.5)

    animator.setMode("idle", 1, true)
    animator.update(0.5)
    expect(part.position.x).toBeCloseTo(0)
    expect(part.position.y).toBeCloseTo(0.5)

    animator.setMode("still", 1)
    expect(animator.running).toBe(false)
    expect(part.position.y).toBeCloseTo(0)
    animator.dispose()
  })

  it("scales the walk cycle with the robot's speed", () => {
    const { root, part, walk, idle } = rig()
    const animator = new RobotAnimator(root, { walk, idle }, 0)
    animator.setMode("walk", 2)
    animator.update(0.125)
    expect(part.position.x).toBeCloseTo(0.5)
  })

  it("cross-fades from Walk to Idle", () => {
    const { root, part, walk, idle } = rig()
    const animator = new RobotAnimator(root, { walk, idle }, 0)
    animator.setMode("walk", 1)
    animator.update(0.5)
    animator.setMode("idle", 1)
    animator.update(0.1)
    // Mid fade: both clips still contribute.
    expect(part.position.x).toBeGreaterThan(0.05)
    expect(part.position.y).toBeGreaterThan(0.01)
    animator.update(0.5)
    expect(part.position.x).toBeCloseTo(0)
  })

  it("advances only the running animators of a set", () => {
    const a = rig()
    const b = rig()
    const walking = new RobotAnimator(a.root, a, 0)
    const frozen = new RobotAnimator(b.root, b, 0)
    walking.setMode("walk", 1)
    frozen.setMode("still", 1)
    const set = new RobotAnimatorSet()
    set.add(walking)
    set.add(frozen)
    set.update(0.25)
    expect(a.part.position.x).toBeCloseTo(0.5)
    expect(b.part.position.y).toBeCloseTo(0)
    set.delete(frozen)
    expect(set.size).toBe(1)
    set.update(Number.NaN)
    expect(a.part.position.x).toBeCloseTo(0.5)
  })
})

describe("rigged robot models", () => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)

  for (const district of ROBOT_MODEL_DISTRICTS) {
    it(`${district} is skinned with Walk and Idle clips that animate a clone`, async () => {
      const bytes = readFileSync(join(process.cwd(), "public", "models", "robots", `${district}.glb`))
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      const gltf = await loader.parseAsync(buffer, "")
      const meshes: SkinnedMesh[] = []
      gltf.scene.traverse((object) => {
        if (object instanceof SkinnedMesh) meshes.push(object)
      })
      expect(meshes.length).toBeGreaterThan(0)
      const walk = AnimationClip.findByName(gltf.animations, WALK_CLIP)
      const idle = AnimationClip.findByName(gltf.animations, IDLE_CLIP)
      expect(walk).toBeTruthy()
      expect(idle).toBeTruthy()

      // The primitives share one skin, so they merge into one SkinnedMesh (one draw, one skeleton per robot).
      const vertices = meshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count, 0)
      mergeSkinnedPrimitives(gltf.scene, createRobotMaterial(1))
      const merged: SkinnedMesh[] = []
      gltf.scene.traverse((object) => {
        if (object instanceof SkinnedMesh) merged.push(object)
      })
      expect(merged).toHaveLength(1)
      expect(merged[0].geometry.getAttribute("position").count).toBe(vertices)
      expect(merged[0].skeleton).toBe(meshes[0].skeleton)

      // Two robots of one district own separate bones.
      const first = cloneSkinned(gltf.scene)
      const second = cloneSkinned(gltf.scene)
      const boneOf = (root: Object3D) => {
        let mesh: SkinnedMesh | null = null
        root.traverse((object) => {
          if (!mesh && object instanceof SkinnedMesh) mesh = object
        })
        return (mesh as SkinnedMesh | null)?.skeleton.bones[1]
      }
      const bone = boneOf(first)
      expect(bone).toBeTruthy()
      expect(bone).not.toBe(boneOf(second))

      const pose = (root: Object3D) => {
        const parts: number[] = []
        root.traverse((object) => {
          if ((object as { isBone?: boolean }).isBone) parts.push(...object.quaternion.toArray(), ...object.position.toArray())
        })
        return parts
      }
      const rest = pose(first)
      const animator = new RobotAnimator(first, { walk: walk!, idle: idle! }, 0)
      animator.setMode("walk", 1)
      let change = 0
      for (let i = 0; i < 8; i++) {
        animator.update(walk!.duration / 8)
        const now = pose(first)
        change = Math.max(change, ...now.map((value, j) => Math.abs(value - rest[j])))
      }
      expect(change).toBeGreaterThan(0.01)
      // The other clone never moved.
      expect(pose(second)).toEqual(rest)
      animator.dispose()
    })
  }
})
