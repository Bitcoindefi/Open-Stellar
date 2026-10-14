"use client"

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
} from "three"
import { groupParts, type BlinkPhase, type GlowInstance, type PartShape } from "@/lib/city3d/buildings"

/**
 * Instanced low-poly parts: every shape is a unit primitive (centred, one unit
 * per axis) shared by the whole scene, and every family of parts with the same
 * shape and look is one InstancedMesh, so one draw call.
 */

let geometries: Map<PartShape, BufferGeometry> | null = null

function createGeometry(shape: PartShape): BufferGeometry {
  switch (shape) {
    case "cylinder":
      return new CylinderGeometry(0.5, 0.5, 1, 8)
    case "cone":
      return new ConeGeometry(0.5, 1, 6)
    case "pyramid":
      // Four sides with the square base edges along x and z, one unit wide.
      return new ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4)
    case "dome":
      return new SphereGeometry(0.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1).translate(0, -0.5, 0)
    case "dish":
      return new CylinderGeometry(0.5, 0.14, 1, 8)
    case "octahedron":
      return new OctahedronGeometry(0.5)
    default:
      return new BoxGeometry(1, 1, 1)
  }
}

export function getPartGeometry(shape: PartShape): BufferGeometry {
  geometries ??= new Map()
  let geometry = geometries.get(shape)
  if (!geometry) {
    geometry = createGeometry(shape)
    geometries.set(shape, geometry)
  }
  return geometry
}

/** Frees the shared part geometries (when the 3D view unmounts). */
export function disposePartGeometries(): void {
  if (!geometries) return
  for (const geometry of geometries.values()) geometry.dispose()
  geometries = null
}

/** Faceted, slightly rough surface shared by every lit part. */
export function createLitMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ flatShading: true, roughness: 0.82, metalness: 0.12 })
}

export type PartKind = "lit" | "glow"

interface PartBatchProps {
  parts: readonly GlowInstance[]
  shape: PartShape
  kind: PartKind
  blink: BlinkPhase
  reduceMotion: boolean
}

const BLINK_SPEED = 2.2

const PartBatch = memo(function PartBatch({ parts, shape, kind, blink, reduceMotion }: PartBatchProps) {
  const ref = useRef<InstancedMesh>(null)
  const geometry = getPartGeometry(shape)
  // Glowing parts are unlit (no tone mapping) so they read as light sources at dusk.
  const material: Material = useMemo(
    () => (kind === "glow" ? new MeshBasicMaterial({ toneMapped: false }) : createLitMaterial()),
    [kind],
  )

  useEffect(() => () => material.dispose(), [material])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const matrix = new Matrix4()
    const position = new Vector3()
    const rotation = new Quaternion()
    const euler = new Euler()
    const scale = new Vector3()
    const color = new Color()
    parts.forEach((p, i) => {
      position.set(p.x, p.y, p.z)
      rotation.setFromEuler(euler.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0))
      scale.set(p.sx, p.sy, p.sz)
      mesh.setMatrixAt(i, matrix.compose(position, rotation, scale))
      mesh.setColorAt(i, color.set(p.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [parts])

  useFrame(({ clock }) => {
    if (blink === 0 || reduceMotion || !(material instanceof MeshBasicMaterial)) return
    const phase = blink === 1 ? 0 : Math.PI
    material.color.setScalar(Math.sin(clock.elapsedTime * BLINK_SPEED + phase) > 0.2 ? 1 : 0.25)
  })

  if (parts.length === 0) return null
  return <instancedMesh key={parts.length} ref={ref} args={[geometry, material, parts.length]} />
})

interface InstancedPartsProps {
  parts: readonly GlowInstance[]
  kind: PartKind
  /** Blinking glow parts hold steady under reduced motion. */
  reduceMotion?: boolean
}

/** All parts of one kind: one InstancedMesh per shape (and blink phase for glowing parts). */
export const InstancedParts = memo(function InstancedParts({ parts, kind, reduceMotion = false }: InstancedPartsProps) {
  const batches = useMemo(() => groupParts(parts, kind === "glow"), [parts, kind])

  return (
    <group>
      {batches.map((batch) => (
        <PartBatch key={batch.key} parts={batch.parts} shape={batch.shape} kind={kind} blink={batch.blink} reduceMotion={reduceMotion} />
      ))}
    </group>
  )
})
