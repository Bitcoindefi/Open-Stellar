import { getCoverCrop } from "@/lib/district-backgrounds"
import type { IslandLayout, WorldPoint, WorldRect } from "./layout"

/**
 * Ground under the 3D city: a street plate around the district islands, then
 * water that fades out so the skyline backdrop shows past the edge. Pure layout
 * helpers; the texture itself is painted by components/city3d/city-ground.tsx.
 */

/** Street plate margin around the islands (world units). */
export const PLATE_MARGIN = 2.2
/** Water margin around the street plate before the ground fades out. */
export const GROUND_MARGIN = 20
/** Street ring painted around each island (world units). */
export const ROAD_WIDTH = 0.95
/** Texture density of the ground, capped by MAX_GROUND_TEXTURE on the long side. */
export const GROUND_TEXELS_PER_UNIT = 24
export const MAX_GROUND_TEXTURE = 2048
/** Share of the ground radius (ellipse) where the water starts fading to transparent. */
export const GROUND_FADE_START = 0.74

export interface GroundLayout {
  /** The whole ground plane. */
  bounds: WorldRect
  /** Street plate under the districts. */
  plate: WorldRect
  center: WorldPoint
  width: number
  depth: number
}

/** Union of the island tops, or null without islands. */
export function getIslandsExtent(islands: readonly Pick<IslandLayout, "bounds">[]): WorldRect | null {
  if (islands.length === 0) return null
  return islands.reduce<WorldRect>(
    (acc, { bounds }) => ({
      minX: Math.min(acc.minX, bounds.minX),
      maxX: Math.max(acc.maxX, bounds.maxX),
      minZ: Math.min(acc.minZ, bounds.minZ),
      maxZ: Math.max(acc.maxZ, bounds.maxZ),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  )
}

export function expandRect(rect: WorldRect, by: number): WorldRect {
  return { minX: rect.minX - by, maxX: rect.maxX + by, minZ: rect.minZ - by, maxZ: rect.maxZ + by }
}

export function getGroundLayout(
  islands: readonly Pick<IslandLayout, "bounds">[],
  plateMargin = PLATE_MARGIN,
  groundMargin = GROUND_MARGIN,
): GroundLayout {
  const extent = getIslandsExtent(islands) ?? { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
  const plate = expandRect(extent, plateMargin)
  const bounds = expandRect(plate, groundMargin)
  return {
    bounds,
    plate,
    center: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
    width: bounds.maxX - bounds.minX,
    depth: bounds.maxZ - bounds.minZ,
  }
}

/** Ground texture size in pixels: proportional to the plane, long side capped. */
export function getGroundTextureSize(
  layout: Pick<GroundLayout, "width" | "depth">,
  texelsPerUnit = GROUND_TEXELS_PER_UNIT,
  max = MAX_GROUND_TEXTURE,
): { width: number; height: number } {
  const long = Math.max(layout.width, layout.depth, 1e-6)
  const density = Math.min(texelsPerUnit, max / long)
  return {
    width: Math.max(1, Math.round(layout.width * density)),
    height: Math.max(1, Math.round(layout.depth * density)),
  }
}

/** Maps a world rectangle into ground texture pixels (x right, y down the 2D map). */
export function rectToTexture(
  rect: WorldRect,
  layout: Pick<GroundLayout, "bounds" | "width" | "depth">,
  size: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const kx = size.width / layout.width
  const ky = size.height / layout.depth
  return {
    x: (rect.minX - layout.bounds.minX) * kx,
    y: (rect.minZ - layout.bounds.minZ) * ky,
    width: (rect.maxX - rect.minX) * kx,
    height: (rect.maxZ - rect.minZ) * ky,
  }
}

/**
 * Whether the street plate corners sit inside the opaque part of the elliptical
 * fade, so the city never stands on faded ground.
 */
export function isPlateOpaque(layout: GroundLayout, fadeStart = GROUND_FADE_START): boolean {
  const rx = layout.width / 2
  const rz = layout.depth / 2
  const dx = Math.max(Math.abs(layout.plate.minX - layout.center.x), Math.abs(layout.plate.maxX - layout.center.x))
  const dz = Math.max(Math.abs(layout.plate.minZ - layout.center.z), Math.abs(layout.plate.maxZ - layout.center.z))
  return Math.hypot(dx / rx, dz / rz) < fadeStart
}

export interface TextureWindow {
  offsetX: number
  offsetY: number
  repeatX: number
  repeatY: number
}

/**
 * Texture window that covers an island top with its district art without
 * stretching it (object-fit: cover, positioned by the art focus). Offsets are
 * in three.js UV space, where v grows up the image (flipY textures).
 */
export function getIslandArtWindow(
  island: Pick<IslandLayout, "width" | "depth">,
  imageWidth: number,
  imageHeight: number,
  focusX = 0.5,
  focusY = 0.5,
): TextureWindow {
  if (imageWidth <= 0 || imageHeight <= 0 || island.width <= 0 || island.depth <= 0) {
    return { offsetX: 0, offsetY: 0, repeatX: 1, repeatY: 1 }
  }
  // Scale the island up so the pixel rounding in getCoverCrop stays negligible.
  const crop = getCoverCrop(imageWidth, imageHeight, island.width * 100, island.depth * 100, focusX, focusY)
  return {
    offsetX: crop.sx / imageWidth,
    offsetY: 1 - (crop.sy + crop.sh) / imageHeight,
    repeatX: crop.sw / imageWidth,
    repeatY: crop.sh / imageHeight,
  }
}
