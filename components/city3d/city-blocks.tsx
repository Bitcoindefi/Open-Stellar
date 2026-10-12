"use client"

import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { BoxGeometry, Color, Matrix4, MeshBasicMaterial, MeshLambertMaterial, type InstancedMesh } from "three"
import type { BoxInstance, CityBlocks as CityBlocksData } from "@/lib/city3d/buildings"

type BoxKind = "lit" | "glow"

interface InstancedBoxesProps {
  boxes: BoxInstance[]
  kind: BoxKind
  /** Slow on/off blink for rooftop beacons (off under reduced motion). */
  blink?: boolean
}

/** One InstancedMesh (one draw call) for a whole family of boxes. */
function InstancedBoxes({ boxes, kind, blink = false }: InstancedBoxesProps) {
  const ref = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), [])
  // Lambert keeps per-pixel cost low on weak GPUs; glowing parts are unlit.
  const material = useMemo(
    () => (kind === "glow" ? new MeshBasicMaterial({ toneMapped: false }) : new MeshLambertMaterial()),
    [kind],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const matrix = new Matrix4()
    const color = new Color()
    boxes.forEach((b, i) => {
      matrix.makeScale(b.sx, b.sy, b.sz)
      matrix.setPosition(b.x, b.y, b.z)
      mesh.setMatrixAt(i, matrix)
      mesh.setColorAt(i, color.set(b.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [boxes])

  useFrame(({ clock }) => {
    if (!blink) return
    material.color.setScalar(Math.sin(clock.elapsedTime * 2.2) > 0.3 ? 1 : 0.22)
  })

  if (boxes.length === 0) return null
  return <instancedMesh key={boxes.length} ref={ref} args={[geometry, material, boxes.length]} />
}

interface CityBlocksProps {
  blocks: CityBlocksData
  reduceMotion: boolean
}

/** Platforms, plazas, buildings, lit windows and rooftop masts: six draw calls in total. */
export function CityBlocks({ blocks, reduceMotion }: CityBlocksProps) {
  return (
    <group>
      <InstancedBoxes boxes={blocks.platforms} kind="lit" />
      <InstancedBoxes boxes={blocks.buildings} kind="lit" />
      <InstancedBoxes boxes={blocks.masts} kind="lit" />
      <InstancedBoxes boxes={blocks.rims} kind="glow" />
      <InstancedBoxes boxes={blocks.windows} kind="glow" />
      <InstancedBoxes boxes={blocks.beacons} kind="glow" blink={!reduceMotion} />
    </group>
  )
}
