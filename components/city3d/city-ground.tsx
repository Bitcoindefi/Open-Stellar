"use client"

import { memo, useEffect, useMemo, useState } from "react"
import { useThree } from "@react-three/fiber"
import { CanvasTexture, MeshBasicMaterial, MeshLambertMaterial, SRGBColorSpace, type Texture } from "three"
import { DISTRICT_BACKGROUNDS } from "@/lib/district-backgrounds"
import { ISLAND_HEIGHT, type IslandLayout, type WorldRect } from "@/lib/city3d/layout"
import { createRng, hashString } from "@/lib/city3d/paths"
import {
  GROUND_FADE_START,
  ROAD_WIDTH,
  expandRect,
  getGroundLayout,
  getGroundTextureSize,
  getIslandArtWindow,
  rectToTexture,
  type GroundLayout,
} from "@/lib/city3d/terrain"
import { getDistrictArtTexture } from "./textures"

/** District interior art size (lib/district-backgrounds.ts). */
const ART_WIDTH = 1344
const ART_HEIGHT = 752
/** The street plate is a slab this thick; the water sits a little below its top. */
const PLATE_THICKNESS = 0.45
const PLATE_TOP = -ISLAND_HEIGHT
const WATER_Y = PLATE_TOP - PLATE_THICKNESS * 0.55
/** Texture density for the street plate and the water (pixels per world unit). */
const PLATE_TEXELS = 28
const WATER_TEXELS = 6

const PAVEMENT = "#4b5f86"
const TILE_LINE = "rgba(226,232,240,0.08)"
const ROAD = "#283552"
const LANE = "rgba(253,230,138,0.8)"
const PLATE_EDGE = "#67e8f9"
const PLATE_SIDE = "#334a70"
const WATER_NEAR = "#1f5a8c"
const WATER_FAR = "#1a3f70"
const RIPPLE = "rgba(186,230,253,0.28)"

type Ctx = CanvasRenderingContext2D

function newCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: Ctx } | null {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  return ctx ? { canvas, ctx } : null
}

function toTexture(canvas: HTMLCanvasElement, anisotropy: number): Texture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = anisotropy
  return texture
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  // Older Safari (before 16) has no roundRect; square corners are fine there.
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)))
  else ctx.rect(x, y, w, h)
}

/**
 * Street plate under the districts: pavement tiles, a road ring with lane
 * dashes around every island, a neon pool of the district color at each island
 * base and a glowing edge.
 */
function paintPlate(layout: GroundLayout, islands: readonly IslandLayout[], anisotropy: number): Texture | null {
  const frame = {
    bounds: layout.plate,
    width: layout.plate.maxX - layout.plate.minX,
    depth: layout.plate.maxZ - layout.plate.minZ,
  }
  const size = getGroundTextureSize(frame, PLATE_TEXELS)
  const target = newCanvas(size.width, size.height)
  if (!target) return null
  const { canvas, ctx } = target
  const unit = size.width / frame.width
  const px = (rect: WorldRect) => rectToTexture(rect, frame, size)

  ctx.fillStyle = PAVEMENT
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.strokeStyle = TILE_LINE
  ctx.lineWidth = Math.max(1, unit * 0.04)
  ctx.beginPath()
  for (let x = unit; x < size.width; x += unit) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, size.height)
  }
  for (let y = unit; y < size.height; y += unit) {
    ctx.moveTo(0, y)
    ctx.lineTo(size.width, y)
  }
  ctx.stroke()

  ctx.fillStyle = ROAD
  for (const island of islands) {
    const road = px(expandRect(island.bounds, ROAD_WIDTH))
    roundRect(ctx, road.x, road.y, road.width, road.height, unit * 0.5)
    ctx.fill()
  }

  ctx.strokeStyle = LANE
  ctx.lineWidth = Math.max(1, unit * 0.08)
  ctx.setLineDash([unit * 0.45, unit * 0.35])
  for (const island of islands) {
    const lane = px(expandRect(island.bounds, ROAD_WIDTH / 2))
    roundRect(ctx, lane.x, lane.y, lane.width, lane.height, unit * 0.3)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Neon pool at each island base: only the blur shows, the island covers the fill.
  for (const island of islands) {
    const base = px(island.bounds)
    ctx.save()
    ctx.shadowColor = island.color
    ctx.shadowBlur = unit * 0.9
    ctx.fillStyle = island.color
    ctx.fillRect(base.x, base.y, base.width, base.height)
    ctx.restore()
  }

  ctx.save()
  ctx.strokeStyle = PLATE_EDGE
  ctx.shadowColor = PLATE_EDGE
  ctx.shadowBlur = unit * 0.5
  ctx.lineWidth = Math.max(2, unit * 0.14)
  const inset = unit * 0.12
  roundRect(ctx, inset, inset, size.width - inset * 2, size.height - inset * 2, unit * 0.6)
  ctx.stroke()
  ctx.restore()

  return toTexture(canvas, anisotropy)
}

/** Harbor water around the plate, fading out at its edge so the skyline backdrop shows through. */
function paintWater(layout: GroundLayout, anisotropy: number): Texture | null {
  const size = getGroundTextureSize(layout, WATER_TEXELS)
  const target = newCanvas(size.width, size.height)
  if (!target) return null
  const { canvas, ctx } = target
  const cx = size.width / 2
  const cy = size.height / 2
  const radius = size.width / 2

  const body = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
  body.addColorStop(0, WATER_NEAR)
  body.addColorStop(1, WATER_FAR)
  ctx.fillStyle = body
  ctx.fillRect(0, 0, size.width, size.height)

  // Soft city light on the water around the plate.
  const plate = rectToTexture(layout.plate, layout, size)
  ctx.save()
  ctx.shadowColor = "rgba(103,232,249,0.7)"
  ctx.shadowBlur = size.width / layout.width * 2.5
  ctx.fillStyle = WATER_NEAR
  ctx.fillRect(plate.x, plate.y, plate.width, plate.height)
  ctx.restore()

  const rng = createRng(hashString("harbor"))
  const unit = size.width / layout.width
  ctx.strokeStyle = RIPPLE
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 260; i++) {
    const x = rng() * size.width
    const y = rng() * size.height
    const length = unit * (0.8 + rng() * 2.2)
    ctx.moveTo(x, y)
    ctx.lineTo(x + length, y)
  }
  ctx.stroke()

  // Elliptical fade to transparent toward the plane edge.
  ctx.save()
  ctx.globalCompositeOperation = "destination-in"
  ctx.translate(cx, cy)
  ctx.scale(1, size.height / size.width)
  const fade = ctx.createRadialGradient(0, 0, radius * GROUND_FADE_START, 0, 0, radius)
  fade.addColorStop(0, "rgba(0,0,0,1)")
  fade.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = fade
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2)
  ctx.restore()

  return toTexture(canvas, anisotropy)
}

interface CityGroundProps {
  islands: readonly IslandLayout[]
}

/**
 * Terrain under the floating districts: a street plate slab with roads, set in
 * harbor water that fades into the skyline backdrop, plus each district's
 * interior art on its island top. Five to eight draw calls in all.
 */
export const CityGround = memo(function CityGround({ islands }: CityGroundProps) {
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
  const layout = useMemo(() => getGroundLayout(islands), [islands])
  const plateTexture = useMemo(() => paintPlate(layout, islands, anisotropy), [layout, islands, anisotropy])
  const waterTexture = useMemo(() => paintWater(layout, anisotropy), [layout, anisotropy])
  const sideMaterial = useMemo(() => new MeshLambertMaterial({ color: PLATE_SIDE }), [])
  const plateWidth = layout.plate.maxX - layout.plate.minX
  const plateDepth = layout.plate.maxZ - layout.plate.minZ
  const plateX = (layout.plate.minX + layout.plate.maxX) / 2
  const plateZ = (layout.plate.minZ + layout.plate.maxZ) / 2

  useEffect(() => () => plateTexture?.dispose(), [plateTexture])
  useEffect(() => () => waterTexture?.dispose(), [waterTexture])
  useEffect(() => () => sideMaterial.dispose(), [sideMaterial])
  useEffect(() => invalidate(), [plateTexture, waterTexture, invalidate])

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[layout.center.x, WATER_Y, layout.center.z]} renderOrder={-1}>
        <planeGeometry args={[layout.width, layout.depth]} />
        <meshBasicMaterial map={waterTexture} color={waterTexture ? "#ffffff" : WATER_FAR} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh material={sideMaterial} position={[plateX, PLATE_TOP - 0.02 - PLATE_THICKNESS / 2, plateZ]}>
        <boxGeometry args={[plateWidth, PLATE_THICKNESS, plateDepth]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[plateX, PLATE_TOP, plateZ]}>
        <planeGeometry args={[plateWidth, plateDepth]} />
        <meshBasicMaterial map={plateTexture} color={plateTexture ? "#ffffff" : PAVEMENT} toneMapped={false} />
      </mesh>
      {islands.map((island) => (
        <IslandArt key={island.id} island={island} />
      ))}
    </group>
  )
})

/** Lifted just above the platform top so the art never z-fights with it. */
const ART_Y = 0.012

/** The district's 2D interior art laid on its island top (cover-cropped, like the 2D panels). */
function IslandArt({ island }: { island: IslandLayout }) {
  const invalidate = useThree((state) => state.invalidate)
  const art = Object.prototype.hasOwnProperty.call(DISTRICT_BACKGROUNDS, island.id)
    ? DISTRICT_BACKGROUNDS[island.id]
    : null
  const [base, setBase] = useState<Texture | null>(null)

  useEffect(() => {
    if (!art) return
    let alive = true
    getDistrictArtTexture(art.webp).then(
      (texture) => {
        if (alive) setBase(texture)
      },
      () => {},
    )
    return () => {
      alive = false
    }
  }, [art])

  const texture = useMemo(() => {
    if (!base || !art) return null
    const clone = base.clone()
    const crop = getIslandArtWindow(island, ART_WIDTH, ART_HEIGHT, art.focusX, art.focusY)
    clone.offset.set(crop.offsetX, crop.offsetY)
    clone.repeat.set(crop.repeatX, crop.repeatY)
    return clone
  }, [base, art, island])
  const material = useMemo(() => (texture ? new MeshBasicMaterial({ map: texture, toneMapped: false }) : null), [texture])

  useEffect(() => () => texture?.dispose(), [texture])
  useEffect(() => () => material?.dispose(), [material])
  useEffect(() => invalidate(), [material, invalidate])

  if (!material) return null
  return (
    <mesh material={material} rotation-x={-Math.PI / 2} position={[island.center.x, ART_Y, island.center.z]}>
      <planeGeometry args={[island.width, island.depth]} />
    </mesh>
  )
}
