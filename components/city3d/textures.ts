import { CanvasTexture, SRGBColorSpace, Texture } from "three"
import { getSpriteVariantKey } from "@/lib/city3d/sprites"

/**
 * Texture cache for the 3D city's robot sprites (the environment itself is
 * untextured low-poly geometry). Only the lazily loaded 3D view imports this,
 * so none of these textures exist while the 2D map is showing.
 */

const images = new Map<string, Promise<HTMLImageElement>>()
const textures = new Map<string, Promise<Texture>>()

function remember<T>(cache: Map<string, Promise<T>>, key: string, create: () => Promise<T>): Promise<T> {
  let pending = cache.get(key)
  if (!pending) {
    pending = create()
    cache.set(key, pending)
    // A failed load can be retried by the next caller.
    pending.catch(() => cache.delete(key))
  }
  return pending
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return remember(images, url, () => {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.decoding = "async"
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error(`[city-3d] could not load ${url}`))
      image.src = url
    })
  })
}

function srgb<T extends Texture>(texture: T): T {
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

/**
 * Copies `image` into a canvas through a canvas filter. Browsers without canvas filters (Safari before 18)
 * get the art unfiltered, as the 2D map does.
 */
function canvasCopy(image: HTMLImageElement, filter: string | null): Texture {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, image.naturalWidth)
  canvas.height = Math.max(1, image.naturalHeight)
  const ctx = canvas.getContext("2d")
  if (!ctx) return srgb(new Texture(image))
  if (filter && typeof ctx.filter === "string") ctx.filter = filter
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return srgb(new CanvasTexture(canvas))
}

/**
 * A robot strip with an agent look baked in (hue shift, skin, offline gray).
 * One texture per robot type and filter; robots clone it to pick their own
 * frame, and clones share the GPU upload.
 */
export function getRobotSheetTexture(sheet: string, filter: string | null): Promise<Texture> {
  return remember(textures, getSpriteVariantKey(sheet, filter), async () => {
    const image = await loadImage(sheet)
    return filter ? canvasCopy(image, filter) : srgb(new Texture(image))
  })
}

/** Frees every cached texture (when the 3D view unmounts). */
export function disposeCityTextures(): void {
  for (const pending of textures.values()) {
    pending.then(
      (texture) => texture.dispose(),
      () => {},
    )
  }
  textures.clear()
  images.clear()
}
