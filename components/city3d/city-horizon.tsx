"use client"

import { memo, useEffect, useMemo } from "react"
import { BackSide, Color, Float32BufferAttribute, IcosahedronGeometry, MeshBasicMaterial } from "three"
import type { IslandLayout } from "@/lib/city3d/layout"
import { skyColorAt } from "@/lib/city3d/palette"
import { buildSkylineRing } from "@/lib/city3d/skyline"
import { getGroundLayout, getHarborLayout } from "@/lib/city3d/terrain"
import { InstancedParts } from "./instanced-parts"

/** Inside the camera far plane (600) at any zoom (max distance 140). */
const SKY_RADIUS = 380

/**
 * Low-poly sky dome: a coarse icosphere seen from inside, one flat color per
 * facet from deep blue overhead to violet at the horizon. Unlit and unfogged.
 */
function createSkyGeometry(): IcosahedronGeometry {
  const geometry = new IcosahedronGeometry(SKY_RADIUS, 3)
  const position = geometry.getAttribute("position")
  const colors = new Float32Array(position.count * 3)
  const color = new Color()
  // Non-indexed: every three vertices are one facet, colored by its mean height.
  for (let i = 0; i < position.count; i += 3) {
    const y = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3
    color.set(skyColorAt(y / SKY_RADIUS))
    for (let k = 0; k < 3; k++) colors.set([color.r, color.g, color.b], (i + k) * 3)
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3))
  return geometry
}

export const SkyDome = memo(function SkyDome() {
  const geometry = useMemo(() => createSkyGeometry(), [])
  const material = useMemo(
    () => new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false, toneMapped: false }),
    [],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  return <mesh geometry={geometry} material={material} renderOrder={-10} />
})

interface SkylineRingProps {
  islands: readonly IslandLayout[]
  reduceMotion: boolean
}

/** The ring of low-poly towers on the shore, lit windows in muted district accents. */
export const SkylineRing = memo(function SkylineRing({ islands, reduceMotion }: SkylineRingProps) {
  const ring = useMemo(() => {
    const harbor = getHarborLayout(getGroundLayout(islands))
    return buildSkylineRing(harbor, islands.map((island) => island.color))
  }, [islands])
  const glow = useMemo(() => [...ring.windows, ...ring.beacons], [ring])
  return (
    <group>
      <InstancedParts parts={ring.towers} kind="lit" />
      <InstancedParts parts={glow} kind="glow" reduceMotion={reduceMotion} />
    </group>
  )
})
