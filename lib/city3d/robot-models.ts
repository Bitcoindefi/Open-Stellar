import { getDistrictRobot, type RobotSpriteSet } from "@/lib/robot-sprites"

/**
 * Procedural voxel robots for the 3D city, one design per district robot (the
 * same district -> robot mapping as the 2D sprites in lib/robot-sprites.ts).
 *
 * A robot is a list of boxes in model space: it stands on y = 0 and faces +z.
 * Tones decide how a box is drawn:
 * - shell / dark: the body, vertex colored and shared by every robot of a type
 * - accent: painted with the agent's own color (the 2D hue shift equivalent)
 * - glow: unlit visor, lenses and antenna tips in the agent's color
 */
export type VoxelTone = "shell" | "dark" | "accent" | "glow"

export interface VoxelBox {
  size: [number, number, number]
  position: [number, number, number]
  tone: VoxelTone
}

export type RobotId = RobotSpriteSet["id"]

export interface RobotModel {
  id: RobotId
  shellColor: string
  darkColor: string
  boxes: VoxelBox[]
}

function box(tone: VoxelTone, size: [number, number, number], position: [number, number, number]): VoxelBox {
  return { tone, size, position }
}

/** Mirrors a box to both sides of the x axis. */
function pair(tone: VoxelTone, size: [number, number, number], x: number, y: number, z = 0): VoxelBox[] {
  return [box(tone, size, [-x, y, z]), box(tone, size, [x, y, z])]
}

/** Ring of small cubes floating above the head (the Halo robot). */
function haloRing(y: number, radius: number, count: number, cube: number): VoxelBox[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2
    return box("glow", [cube, cube * 0.6, cube], [Math.cos(angle) * radius, y, Math.sin(angle) * radius])
  })
}

export const ROBOT_MODELS: Record<RobotId, RobotModel> = {
  // Data Center: tall, slim server unit with a wide visor and one antenna.
  nexus: {
    id: "nexus",
    shellColor: "#cbd5e1",
    darkColor: "#334155",
    boxes: [
      ...pair("dark", [0.16, 0.36, 0.18], 0.12, 0.18),
      box("shell", [0.5, 0.5, 0.34], [0, 0.61, 0]),
      box("accent", [0.32, 0.06, 0.02], [0, 0.7, 0.18]),
      box("glow", [0.08, 0.06, 0.02], [-0.1, 0.55, 0.18]),
      ...pair("dark", [0.12, 0.42, 0.14], 0.32, 0.62),
      box("dark", [0.12, 0.06, 0.12], [0, 0.89, 0]),
      box("shell", [0.42, 0.3, 0.34], [0, 1.07, 0]),
      box("glow", [0.34, 0.09, 0.02], [0, 1.08, 0.18]),
      box("dark", [0.04, 0.22, 0.04], [0.12, 1.33, 0]),
      box("glow", [0.08, 0.08, 0.08], [0.12, 1.47, 0]),
    ],
  },
  // Comm Hub: compact courier with two eye lenses and twin antennas.
  bolt: {
    id: "bolt",
    shellColor: "#d1d5db",
    darkColor: "#1f2937",
    boxes: [
      ...pair("dark", [0.14, 0.3, 0.16], 0.12, 0.15),
      box("shell", [0.46, 0.44, 0.36], [0, 0.52, 0]),
      box("accent", [0.28, 0.16, 0.02], [0, 0.5, 0.19]),
      ...pair("dark", [0.11, 0.36, 0.13], 0.29, 0.52),
      box("shell", [0.46, 0.34, 0.38], [0, 0.91, 0]),
      ...pair("glow", [0.1, 0.08, 0.02], 0.1, 0.93, 0.2),
      ...pair("dark", [0.04, 0.26, 0.04], 0.16, 1.21),
      ...pair("glow", [0.08, 0.08, 0.08], 0.16, 1.37),
    ],
  },
  // Processing: wide, low worker with a single big lens and exhaust stacks.
  pulse: {
    id: "pulse",
    shellColor: "#e2e8f0",
    darkColor: "#3f3f46",
    boxes: [
      ...pair("dark", [0.2, 0.24, 0.22], 0.17, 0.12),
      box("shell", [0.66, 0.5, 0.42], [0, 0.49, 0]),
      box("accent", [0.7, 0.08, 0.44], [0, 0.7, 0]),
      ...pair("dark", [0.14, 0.4, 0.16], 0.41, 0.48),
      box("shell", [0.4, 0.26, 0.36], [0, 0.87, 0]),
      box("glow", [0.18, 0.14, 0.02], [0, 0.87, 0.19]),
      ...pair("dark", [0.08, 0.16, 0.08], 0.2, 1.08, -0.08),
    ],
  },
  // Defense Grid: armored guard with shoulder plates, a slit visor and a crest.
  flux: {
    id: "flux",
    shellColor: "#cbd5e1",
    darkColor: "#27272a",
    boxes: [
      ...pair("dark", [0.18, 0.34, 0.2], 0.14, 0.17),
      box("shell", [0.56, 0.52, 0.4], [0, 0.6, 0]),
      ...pair("accent", [0.22, 0.14, 0.36], 0.37, 0.84),
      ...pair("dark", [0.14, 0.38, 0.16], 0.38, 0.58),
      box("shell", [0.36, 0.26, 0.34], [0, 1, 0]),
      box("glow", [0.3, 0.05, 0.02], [0, 1.01, 0.18]),
      box("accent", [0.06, 0.1, 0.3], [0, 1.18, 0]),
    ],
  },
  // Research Lab: slim scientist with a tall head and a floating halo.
  halo: {
    id: "halo",
    shellColor: "#e5e7eb",
    darkColor: "#312e81",
    boxes: [
      ...pair("dark", [0.12, 0.34, 0.14], 0.1, 0.17),
      box("shell", [0.4, 0.46, 0.3], [0, 0.57, 0]),
      box("accent", [0.42, 0.06, 0.32], [0, 0.4, 0]),
      ...pair("dark", [0.1, 0.4, 0.12], 0.26, 0.58),
      box("shell", [0.38, 0.34, 0.34], [0, 0.99, 0]),
      box("glow", [0.28, 0.11, 0.02], [0, 1, 0.18]),
      ...haloRing(1.3, 0.2, 10, 0.07),
    ],
  },
}

/** Voxel robot for a district, using the same mapping as the 2D sprites. */
export function getRobotModel(district: string | null | undefined): RobotModel {
  return ROBOT_MODELS[getDistrictRobot(district).id]
}

/** Top of the highest box, in model units. */
export function getModelHeight(model: Pick<RobotModel, "boxes">): number {
  return model.boxes.reduce((top, b) => Math.max(top, b.position[1] + b.size[1] / 2), 0)
}

/** Uniform scale applied to every robot so designs keep their relative sizes. */
export const ROBOT_WORLD_SCALE = 1.6
