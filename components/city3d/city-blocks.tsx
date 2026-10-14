"use client"

import { memo, useEffect, useMemo } from "react"
import { ExtrudeGeometry, MeshStandardMaterial, Shape } from "three"
import {
  PLATFORM_BEVEL,
  PLATFORM_CHAMFER,
  type BoxInstance,
  type CityBlocks as CityBlocksData,
  type GlowInstance,
} from "@/lib/city3d/buildings"
import type { PropParts } from "@/lib/city3d/props"
import { InstancedParts } from "./instanced-parts"

/**
 * Chamfered slab for one island: the outline has cut corners and the top edge a
 * one-step bevel, so the platform catches the key light on its facets. Top at
 * y = 0, sides down to y = -height.
 */
function createPlatformGeometry(platform: BoxInstance): ExtrudeGeometry {
  const halfW = platform.sx / 2
  const halfD = platform.sz / 2
  const c = Math.min(PLATFORM_CHAMFER, halfW, halfD)
  const shape = new Shape()
  shape.moveTo(-halfW + c, -halfD)
  shape.lineTo(halfW - c, -halfD)
  shape.lineTo(halfW, -halfD + c)
  shape.lineTo(halfW, halfD - c)
  shape.lineTo(halfW - c, halfD)
  shape.lineTo(-halfW + c, halfD)
  shape.lineTo(-halfW, halfD - c)
  shape.lineTo(-halfW, -halfD + c)
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, {
    depth: Math.max(0.01, platform.sy - PLATFORM_BEVEL * 2),
    bevelEnabled: true,
    bevelThickness: PLATFORM_BEVEL,
    bevelSize: PLATFORM_BEVEL,
    bevelOffset: -PLATFORM_BEVEL,
    bevelSegments: 1,
    curveSegments: 1,
  })
  // Shape x/y become world x/z, the extrusion runs down; then the top cap lands on y = 0.
  geometry.rotateX(Math.PI / 2)
  geometry.translate(platform.x, -PLATFORM_BEVEL, platform.z)
  return geometry
}

const IslandPlatform = memo(function IslandPlatform({ platform, top }: { platform: BoxInstance; top: string }) {
  const geometry = useMemo(() => createPlatformGeometry(platform), [platform])
  // ExtrudeGeometry groups: 0 is the caps (top and bottom), 1 the sides and bevel.
  const materials = useMemo(
    () => [
      new MeshStandardMaterial({ color: top, flatShading: true, roughness: 0.88, metalness: 0.05 }),
      new MeshStandardMaterial({ color: platform.color, flatShading: true, roughness: 0.75, metalness: 0.15 }),
    ],
    [platform.color, top],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])
  return <mesh geometry={geometry} material={materials} />
})

interface CityBlocksProps {
  blocks: CityBlocksData
  props: PropParts
  reduceMotion: boolean
}

/**
 * Island platforms, plazas, buildings with setbacks and roofs, lit windows,
 * rooftop masts and beacons, and the district props. Platforms are one mesh per
 * island; everything else is instanced by shape.
 */
export const CityBlocks = memo(function CityBlocks({ blocks, props, reduceMotion }: CityBlocksProps) {
  const lit = useMemo<BoxInstance[]>(
    () => [...blocks.plazas, ...blocks.buildings, ...blocks.masts, ...props.solid],
    [blocks, props],
  )
  const glow = useMemo<GlowInstance[]>(
    () => [...blocks.rims, ...blocks.windows, ...blocks.beacons, ...props.glow],
    [blocks, props],
  )
  return (
    <group>
      {blocks.platforms.map((platform, i) => (
        <IslandPlatform key={i} platform={platform} top={blocks.platformTops[i] ?? platform.color} />
      ))}
      <InstancedParts parts={lit} kind="lit" />
      <InstancedParts parts={glow} kind="glow" reduceMotion={reduceMotion} />
    </group>
  )
})
