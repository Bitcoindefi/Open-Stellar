import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute } from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import type { RobotModel, VoxelBox } from "./robot-models"

/**
 * Turns voxel robot specs into merged three.js geometries: every robot draws
 * as three meshes (body, accent, glow) whatever its number of boxes. Geometries
 * are cached per robot type and shared by every agent that uses it.
 *
 * Only the lazily loaded 3D view imports this module.
 */
export interface RobotGeometries {
  /** Shell and dark boxes, colored per vertex. */
  body: BufferGeometry
  /** Boxes painted with the agent color. */
  accent: BufferGeometry
  /** Unlit visor, lens and antenna tip boxes. */
  glow: BufferGeometry
}

/** Merges boxes into one geometry, optionally baking a per-box vertex color. */
export function buildBoxesGeometry(boxes: readonly VoxelBox[], colorOf?: (box: VoxelBox) => string): BufferGeometry {
  if (boxes.length === 0) return new BufferGeometry()
  const parts = boxes.map((b) => {
    const geometry = new BoxGeometry(b.size[0], b.size[1], b.size[2])
    geometry.translate(b.position[0], b.position[1], b.position[2])
    if (colorOf) {
      const color = new Color(colorOf(b))
      const count = geometry.attributes.position.count
      const colors = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        colors[i * 3] = color.r
        colors[i * 3 + 1] = color.g
        colors[i * 3 + 2] = color.b
      }
      geometry.setAttribute("color", new Float32BufferAttribute(colors, 3))
    }
    return geometry
  })
  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!merged) return new BufferGeometry()
  merged.computeBoundingSphere()
  return merged
}

export function buildRobotGeometries(model: RobotModel): RobotGeometries {
  return {
    body: buildBoxesGeometry(
      model.boxes.filter((b) => b.tone === "shell" || b.tone === "dark"),
      (b) => (b.tone === "shell" ? model.shellColor : model.darkColor),
    ),
    accent: buildBoxesGeometry(model.boxes.filter((b) => b.tone === "accent")),
    glow: buildBoxesGeometry(model.boxes.filter((b) => b.tone === "glow")),
  }
}

const geometryCache = new Map<string, RobotGeometries>()

/** Shared geometries for a robot type (built once per page). */
export function getRobotGeometries(model: RobotModel): RobotGeometries {
  let cached = geometryCache.get(model.id)
  if (!cached) {
    cached = buildRobotGeometries(model)
    geometryCache.set(model.id, cached)
  }
  return cached
}

/** Frees every cached robot geometry (when the 3D view unmounts). */
export function disposeRobotGeometries(): void {
  for (const geometries of geometryCache.values()) {
    geometries.body.dispose()
    geometries.accent.dispose()
    geometries.glow.dispose()
  }
  geometryCache.clear()
}
