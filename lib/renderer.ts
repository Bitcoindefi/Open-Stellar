import type { MoltbotAgent, District } from "./types"
import { DISTRICTS } from "./data"
import { ACCESSORIES } from "./cosmetics"

const PIXEL = 2

type DistrictRenderEventState = {
  isLeading?: boolean
  rank?: number
  scoreLabel?: string
  multiplier?: number
}

function drawRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function drawPixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  for (let py = 0; py < h; py += PIXEL) {
    for (let px = 0; px < w; px += PIXEL) {
      ctx.fillRect(x + px, y + py, PIXEL, PIXEL)
    }
  }
}

function darken(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

function lighten(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount)
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount)
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

export function drawBuilding(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, tick: number) {
  // Main building body
  drawPixelRect(ctx, x, y, w, h, darken(color, 40))
  // Roof accent
  drawPixelRect(ctx, x + 2, y + 2, w - 4, 4, lighten(color, 30))
  // Roof antenna
  drawRect(ctx, x + Math.floor(w / 2) - 1, y - 6, 2, 6, darken(color, 20))
  const blink = Math.sin(tick * 0.1 + x) > 0.5
  drawRect(ctx, x + Math.floor(w / 2) - 2, y - 8, 4, 2, blink ? lighten(color, 80) : darken(color, 30))

  // Windows
  const winW = 6
  const winH = 6
  const gap = 4
  const cols = Math.floor((w - 10) / (winW + gap))
  const rows = Math.floor((h - 16) / (winH + gap))

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = x + 6 + c * (winW + gap)
      const wy = y + 12 + r * (winH + gap)
      const lit = Math.sin(tick * 0.02 + c * 1.5 + r * 2.3 + x * 0.1) > 0.1
      drawRect(ctx, wx, wy, winW, winH, lit ? lighten(color, 60) : darken(color, 60))
    }
  }
}

export function drawDistrict(
  ctx: CanvasRenderingContext2D,
  d: District,
  tick: number,
  bgImage?: HTMLImageElement,
  colorBlindMode = false,
  eventState: DistrictRenderEventState | null = null,
) {
  // Save state for clipping
  ctx.save()

  // Clip to district bounds with rounded corners
  const radius = 8
  ctx.beginPath()
  ctx.moveTo(d.x + radius, d.y)
  ctx.lineTo(d.x + d.w - radius, d.y)
  ctx.quadraticCurveTo(d.x + d.w, d.y, d.x + d.w, d.y + radius)
  ctx.lineTo(d.x + d.w, d.y + d.h - radius)
  ctx.quadraticCurveTo(d.x + d.w, d.y + d.h, d.x + d.w - radius, d.y + d.h)
  ctx.lineTo(d.x + radius, d.y + d.h)
  ctx.quadraticCurveTo(d.x, d.y + d.h, d.x, d.y + d.h - radius)
  ctx.lineTo(d.x, d.y + radius)
  ctx.quadraticCurveTo(d.x, d.y, d.x + radius, d.y)
  ctx.closePath()
  ctx.clip()

  // Draw background image or fallback color
  if (bgImage) {
    ctx.drawImage(bgImage, d.x, d.y, d.w, d.h)
    // Semi-transparent overlay to darken and tint with district color
    ctx.fillStyle = d.bgColor + (colorBlindMode ? "ee" : "cc")
    ctx.fillRect(d.x, d.y, d.w, d.h)
  } else {
    ctx.fillStyle = d.bgColor
    ctx.fillRect(d.x, d.y, d.w, d.h)
  }

  // Pattern fills for color-blind mode
  if (colorBlindMode) {
    ctx.save()
    ctx.strokeStyle = d.color + "44"
    ctx.lineWidth = 1
    const idx = DISTRICTS.findIndex(dist => dist.id === d.id)

    if (idx === 0) { // Data Center - Diagonal Hatching
      for (let i = -d.h; i < d.w; i += 8) {
        ctx.beginPath()
        ctx.moveTo(d.x + i, d.y)
        ctx.lineTo(d.x + i + d.h, d.y + d.h)
        ctx.stroke()
      }
    } else if (idx === 1) { // Comm Hub - Dots
      ctx.fillStyle = d.color + "44"
      for (let px = 4; px < d.w; px += 10) {
        for (let py = 4; py < d.h; py += 10) {
          ctx.beginPath()
          ctx.arc(d.x + px, d.y + py, 1, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    } else if (idx === 2) { // Processing - Crosshatch
      for (let i = 0; i < d.w + d.h; i += 10) {
        ctx.beginPath()
        ctx.moveTo(d.x + i, d.y)
        ctx.lineTo(d.x, d.y + i)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(d.x + d.w - i, d.y)
        ctx.lineTo(d.x + d.w, d.y + i)
        ctx.stroke()
      }
    } else if (idx === 3) { // Defense - Vertical Stripes
      for (let i = 0; i < d.w; i += 6) {
        ctx.beginPath()
        ctx.moveTo(d.x + i, d.y)
        ctx.lineTo(d.x + i, d.y + d.h)
        ctx.stroke()
      }
    } else { // Research Lab - Horizontal Stripes
      for (let i = 0; i < d.h; i += 6) {
        ctx.beginPath()
        ctx.moveTo(d.x, d.y + i)
        ctx.lineTo(d.x + d.w, d.y + i)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  // Pixel scanline effect over the background
  ctx.fillStyle = "rgba(0,0,0,0.08)"
  for (let sy = d.y; sy < d.y + d.h; sy += 4) {
    ctx.fillRect(d.x, sy, d.w, 1)
  }

  ctx.restore()

  // Border glow
  const eventPulse = eventState ? Math.sin(tick * 0.16) * 0.25 + 0.75 : 0
  ctx.shadowColor = eventState ? d.color : "transparent"
  ctx.shadowBlur = eventState ? (eventState.isLeading ? 24 : 12) * eventPulse : 0
  ctx.strokeStyle = eventState ? d.color + (eventState.isLeading ? "dd" : "99") : d.color + "55"
  ctx.lineWidth = eventState?.isLeading ? 4 : 2
  ctx.beginPath()
  ctx.moveTo(d.x + radius, d.y)
  ctx.lineTo(d.x + d.w - radius, d.y)
  ctx.quadraticCurveTo(d.x + d.w, d.y, d.x + d.w, d.y + radius)
  ctx.lineTo(d.x + d.w, d.y + d.h - radius)
  ctx.quadraticCurveTo(d.x + d.w, d.y + d.h, d.x + d.w - radius, d.y + d.h)
  ctx.lineTo(d.x + radius, d.y + d.h)
  ctx.quadraticCurveTo(d.x, d.y + d.h, d.x, d.y + d.h - radius)
  ctx.lineTo(d.x, d.y + radius)
  ctx.quadraticCurveTo(d.x, d.y, d.x + radius, d.y)
  ctx.closePath()
  ctx.stroke()
  ctx.shadowBlur = 0

  // Animated corner glow pulses
  const pulse = Math.sin(tick * 0.05) * 0.3 + 0.7
  ctx.fillStyle = d.color + Math.round(pulse * 80).toString(16).padStart(2, "0")
  ctx.fillRect(d.x, d.y, 3, 3)
  ctx.fillRect(d.x + d.w - 3, d.y, 3, 3)
  ctx.fillRect(d.x, d.y + d.h - 3, 3, 3)
  ctx.fillRect(d.x + d.w - 3, d.y + d.h - 3, 3, 3)

  // Draw buildings
  const bx = d.x + 8
  const by = d.y + d.h - 64
  drawBuilding(ctx, bx, by, 30, 52, d.color, tick)
  drawBuilding(ctx, bx + 38, by + 16, 24, 36, d.color, tick)
  drawBuilding(ctx, d.x + d.w - 42, by + 8, 28, 44, d.color, tick)

  // District label with background pill
  ctx.font = "bold 10px monospace"
  const districtLabel = d.name.toUpperCase()
  const scoreLabel = eventState?.scoreLabel ? ` #${eventState.rank} ${eventState.scoreLabel}${eventState.multiplier && eventState.multiplier > 1 ? ` ${eventState.multiplier}x` : ""}` : ""
  const labelW = Math.max(ctx.measureText(districtLabel).width, scoreLabel ? ctx.measureText(scoreLabel).width : 0) + 12
  ctx.fillStyle = d.bgColor + "dd"
  ctx.fillRect(d.x + 6, d.y + 6, labelW, scoreLabel ? 30 : 18)
  ctx.fillStyle = d.color
  ctx.fillText(districtLabel, d.x + 12, d.y + 18)
  if (scoreLabel) {
    ctx.font = "bold 9px monospace"
    ctx.fillStyle = eventState?.isLeading ? "#fbbf24" : "#cbd5e1"
    ctx.fillText(scoreLabel, d.x + 12, d.y + 30)
  }
}

// Cache for processed sprites: key = src+color
const tintCache = new Map<string, HTMLCanvasElement>()

function getProcessedSprite(
  sprite: HTMLImageElement,
  color: string,
  cropRegion?: [number, number, number, number]
): HTMLCanvasElement {
  const key = sprite.src + "|" + color + "|" + (cropRegion ? cropRegion.join(",") : "auto")
  if (tintCache.has(key)) return tintCache.get(key)!

  const sw = sprite.naturalWidth || sprite.width
  const sh = sprite.naturalHeight || sprite.height

  // If a manual crop region is specified (fraction 0-1), extract only that sub-region first
  let srcX = 0, srcY = 0, srcW = sw, srcH = sh
  if (cropRegion) {
    srcX = Math.floor(cropRegion[0] * sw)
    srcY = Math.floor(cropRegion[1] * sh)
    srcW = Math.floor(cropRegion[2] * sw)
    srcH = Math.floor(cropRegion[3] * sh)
  }

  // Step 1: draw the (possibly cropped) region to sample its background color from corners
  const tmp = document.createElement("canvas")
  tmp.width = srcW
  tmp.height = srcH
  const tc = tmp.getContext("2d")!
  tc.drawImage(sprite, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH)

  const fullData = tc.getImageData(0, 0, srcW, srcH)
  const fd = fullData.data
  const corners = [
    { x: 0, y: 0 },
    { x: srcW - 1, y: 0 },
    { x: 0, y: srcH - 1 },
    { x: srcW - 1, y: srcH - 1 },
  ]
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0
  for (const c of corners) {
    const idx = (c.y * srcW + c.x) * 4
    if (fd[idx + 3] > 200) {
      bgR += fd[idx]
      bgG += fd[idx + 1]
      bgB += fd[idx + 2]
      bgCount++
    }
  }
  if (bgCount > 0) {
    bgR = Math.round(bgR / bgCount)
    bgG = Math.round(bgG / bgCount)
    bgB = Math.round(bgB / bgCount)
  }

  // Step 2: find bounding box of non-background pixels within the sub-region
  let minX = srcW, minY = srcH, maxX = 0, maxY = 0
  const tolerance = 40
  for (let py = 0; py < srcH; py++) {
    for (let px = 0; px < srcW; px++) {
      const idx = (py * srcW + px) * 4
      const r = fd[idx], g = fd[idx + 1], b = fd[idx + 2], a = fd[idx + 3]
      if (a < 50) continue
      const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)
      if (dist > tolerance) {
        if (px < minX) minX = px
        if (py < minY) minY = py
        if (px > maxX) maxX = px
        if (py > maxY) maxY = py
      }
    }
  }

  const pad = 2
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(srcW - 1, maxX + pad)
  maxY = Math.min(srcH - 1, maxY + pad)
  const cropW = maxX - minX + 1
  const cropH = maxY - minY + 1

  // Step 3: draw auto-cropped content into output, removing background
  const size = 42
  const out = document.createElement("canvas")
  out.width = size
  out.height = size
  const oc = out.getContext("2d")!
  // Draw from the tmp canvas (already sub-cropped) using the auto-crop bounds
  oc.drawImage(tmp, minX, minY, cropW, cropH, 0, 0, size, size)

  const imgData = oc.getImageData(0, 0, size, size)
  const d = imgData.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3]
    if (a < 50) { d[i + 3] = 0; continue }
    const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)
    if (dist < tolerance) {
      d[i + 3] = 0
    }
  }
  oc.putImageData(imgData, 0, 0)

  // Step 4: apply color tint via multiply
  oc.globalCompositeOperation = "multiply"
  oc.fillStyle = color
  oc.fillRect(0, 0, size, size)

  // Restore alpha from cleaned image
  oc.globalCompositeOperation = "destination-in"
  const alphaCanvas = document.createElement("canvas")
  alphaCanvas.width = size
  alphaCanvas.height = size
  const ac = alphaCanvas.getContext("2d")!
  ac.putImageData(imgData, 0, 0)
  oc.drawImage(alphaCanvas, 0, 0)

  oc.globalCompositeOperation = "source-over"

  tintCache.set(key, out)
  return out
}

// Decorative overlay drawn on top of the (already-rendered) sprite for skins unlocked above level 1.
// Hologram transparency is handled separately at draw time since it must affect the sprite itself.
function drawSkinOverlay(
  ctx: CanvasRenderingContext2D,
  agent: MoltbotAgent,
  tick: number,
  drawX: number,
  drawY: number,
  spriteSize: number,
  effectiveColor: string,
) {
  const skin = agent.appearance?.skin ?? "default"
  if (skin === "default" || skin === "legendary") return

  if (skin === "neon") {
    const district = DISTRICTS.find((d) => d.id === agent.district)
    const outlineColor = district?.color ?? effectiveColor
    ctx.save()
    ctx.strokeStyle = outlineColor + "cc"
    ctx.lineWidth = 1.5
    ctx.shadowColor = outlineColor
    ctx.shadowBlur = 6
    ctx.strokeRect(drawX + 1, drawY + 1, spriteSize - 2, spriteSize - 2)
    ctx.restore()
    return
  }

  if (skin === "chrome") {
    ctx.save()
    const pos = (Math.sin(tick * 0.04) + 1) / 2
    const sheen = ctx.createLinearGradient(drawX, drawY, drawX + spriteSize, drawY + spriteSize)
    sheen.addColorStop(Math.max(0, pos - 0.18), "rgba(255,255,255,0)")
    sheen.addColorStop(pos, "rgba(255,255,255,0.45)")
    sheen.addColorStop(Math.min(1, pos + 0.18), "rgba(255,255,255,0)")
    ctx.globalCompositeOperation = "screen"
    ctx.fillStyle = sheen
    ctx.fillRect(drawX, drawY, spriteSize, spriteSize)
    ctx.restore()
    return
  }

  if (skin === "hologram") {
    ctx.save()
    ctx.strokeStyle = "rgba(125,211,252,0.5)"
    ctx.lineWidth = 1
    for (let ly = drawY; ly < drawY + spriteSize; ly += 3) {
      ctx.beginPath()
      ctx.moveTo(drawX, ly)
      ctx.lineTo(drawX + spriteSize, ly)
      ctx.stroke()
    }
    ctx.restore()
    return
  }

  if (skin === "gold") {
    ctx.save()
    ctx.globalCompositeOperation = "multiply"
    ctx.globalAlpha = 0.35
    ctx.fillStyle = "#facc15"
    ctx.fillRect(drawX, drawY, spriteSize, spriteSize)
    ctx.restore()

    const twinkle = Math.sin(tick * 0.2) > 0.3
    if (twinkle) {
      ctx.save()
      ctx.fillStyle = "#fde68a"
      ctx.fillRect(drawX - 1, drawY - 1, 2, 2)
      ctx.fillRect(drawX + spriteSize - 1, drawY - 1, 2, 2)
      ctx.fillRect(drawX - 1, drawY + spriteSize - 1, 2, 2)
      ctx.fillRect(drawX + spriteSize - 1, drawY + spriteSize - 1, 2, 2)
      ctx.restore()
    }
  }
}

// Equipped accessory glyphs (badge-gated), rendered in a row above the sprite.
function drawAccessories(
  ctx: CanvasRenderingContext2D,
  agent: MoltbotAgent,
  drawX: number,
  drawY: number,
  spriteSize: number,
) {
  const accessories = agent.appearance?.accessories ?? []
  if (accessories.length === 0) return

  ctx.save()
  ctx.font = "10px sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const cx = drawX + spriteSize / 2
  accessories.forEach((id, i) => {
    const def = ACCESSORIES.find((a) => a.id === id)
    if (!def) return
    const slotX = cx + (i - (accessories.length - 1) / 2) * 11
    ctx.fillText(def.emoji, slotX, drawY - 4)
  })
  ctx.restore()
}

// Orbiting particle trail + soft glow ring, only for the top-tier Legendary skin.
function drawAuraParticles(ctx: CanvasRenderingContext2D, agent: MoltbotAgent, tick: number, cx: number, cy: number, color: string) {
  if ((agent.appearance?.skin ?? "default") !== "legendary") return

  ctx.save()
  const particleCount = 6
  for (let i = 0; i < particleCount; i++) {
    const angle = tick * 0.04 + (i / particleCount) * Math.PI * 2
    const radius = 18 + Math.sin(tick * 0.08 + i) * 3
    const px = cx + Math.cos(angle) * radius
    const py = cy + Math.sin(angle) * radius * 0.6
    const alpha = Math.max(0, Math.min(1, 0.4 + Math.sin(tick * 0.1 + i) * 0.3))
    ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0")
    ctx.beginPath()
    ctx.arc(px, py, 1.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = color + "33"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, 22 + Math.sin(tick * 0.06) * 2, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

export function drawBot(ctx: CanvasRenderingContext2D, agent: MoltbotAgent, tick: number, isSelected: boolean, sprite?: HTMLImageElement, cropRegion?: [number, number, number, number], colorBlindMode = false) {
  const x = Math.round(agent.pixelX)
  const y = Math.round(agent.pixelY)
  const c = agent.color
  const bobY = agent.status === "working" ? Math.sin(tick * 0.15) * 2 : 0
  const spriteSize = 36
  const cx = x + 8 // center x of the bot
  const cy = y + 10

  if (isSelected) {
    // Pulsing selection ring
    const ringPulse = Math.sin(tick * 0.08) * 2 + 22
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy + 4, ringPulse, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = c + "66"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy + 4, ringPulse + 2, 0, Math.PI * 2)
    ctx.stroke()
  }

  const isDistrictLeader = (agent as MoltbotAgent & { isDistrictLeader?: boolean }).isDistrictLeader

  if (isDistrictLeader) {
    const pulse = Math.sin(tick * 0.1) * 0.25 + 0.75
    ctx.strokeStyle = `${c}${Math.round(pulse * 120).toString(16).padStart(2, "0")}`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy + 4, 20 + pulse * 3, 0, Math.PI * 2)
    ctx.stroke()
  }

  if (agent.status === "offline") {
    const pulse = Math.sin(tick * 0.16) * 0.35 + 0.65
    ctx.strokeStyle = `rgba(248,113,113,${pulse})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy + 4, 18 + pulse * 4, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)"
  ctx.beginPath()
  ctx.ellipse(cx, y + spriteSize - 2, 10, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  // Draw the tinted sprite or fallback
  const drawY = y + bobY - 4
  const drawX = x - spriteSize / 2 + 8

  const skinId = agent.appearance?.skin ?? "default"

  if (sprite) {
    const tinted = getProcessedSprite(sprite, c, cropRegion)
    ctx.save()
    // Hologram skin: semi-transparent, gently flickering
    if (skinId === "hologram") {
      ctx.globalAlpha = 0.55 + Math.sin(tick * 0.1) * 0.15
    }
    // Flip horizontally if facing left
    if (agent.direction === "left") {
      ctx.translate(drawX + spriteSize, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(tinted, 0, drawY, spriteSize, spriteSize)
    } else {
      ctx.drawImage(tinted, drawX, drawY, spriteSize, spriteSize)
    }
    ctx.restore()

    // Dim the sprite for offline/error
    if (agent.status === "offline") {
      ctx.fillStyle = "rgba(0,0,0,0.6)"
      ctx.fillRect(drawX, drawY, spriteSize, spriteSize)
    }
    if (agent.status === "error") {
      // Red flash overlay
      const flash = Math.sin(tick * 0.2) > 0
      if (flash) {
        ctx.fillStyle = "rgba(248,113,113,0.25)"
        ctx.fillRect(drawX, drawY, spriteSize, spriteSize)
      }
    }

    // Cosmetic layers: skin overlay, equipped accessories, legendary aura
    drawSkinOverlay(ctx, agent, tick, drawX, drawY, spriteSize, c)
    drawAccessories(ctx, agent, drawX, drawY, spriteSize)
    drawAuraParticles(ctx, agent, tick, cx, drawY + spriteSize / 2, c)
  } else {
    // Minimal fallback if sprite hasn't loaded
    drawRect(ctx, x + 2, y + bobY, 12, 16, c)
    drawRect(ctx, x + 4, y + bobY + 2, 3, 3, "#000")
    drawRect(ctx, x + 9, y + bobY + 2, 3, 3, "#000")
  }

  // Signal waves for working bots (above sprite head)
  if (agent.status === "working") {
    const antennaGlow = Math.sin(tick * 0.1) > 0
    if (antennaGlow) {
      ctx.strokeStyle = c + "55"
      ctx.lineWidth = 1
      for (let r = 0; r < 3; r++) {
        ctx.beginPath()
        ctx.arc(cx, drawY, 6 + r * 5, -Math.PI * 0.8, -Math.PI * 0.2)
        ctx.stroke()
      }
    }
  }

  if (agent.status === "offline") {
    ctx.font = "bold 7px monospace"
    ctx.textAlign = "center"
    ctx.fillStyle = "#f87171"
    ctx.fillText("OFFLINE", cx, y - 6)
    ctx.textAlign = "left"
  }

  // Crown overlay for top global performers. The city canvas derives the top three
  // from completed task totals so the visual stays in sync with leaderboard data.
  const globalRank = (agent as MoltbotAgent & { leaderboardRank?: number }).leaderboardRank
  if (globalRank && globalRank <= 3) {
    ctx.font = "bold 14px serif"
    ctx.textAlign = "center"
    ctx.fillText("👑", cx, drawY - 4)
    ctx.textAlign = "left"
  }

  // Status indicator dot (top right of sprite)
  const statusColors: Record<string, string> = {
    active: "#34d399",
    working: "#fbbf24",
    idle: "#64748b",
    error: "#f87171",
    offline: "#1e293b",
  }

  const sx = drawX + spriteSize - 6
  const sy = drawY + 2
  const sw = 6
  const sh = 6

  ctx.fillStyle = statusColors[agent.status] || "#64748b"

  if (colorBlindMode) {
    ctx.beginPath()
    if (agent.status === "active") { // Circle
      ctx.arc(sx + sw/2, sy + sh/2, sw/2, 0, Math.PI * 2)
    } else if (agent.status === "working") { // Diamond
      ctx.moveTo(sx + sw/2, sy)
      ctx.lineTo(sx + sw, sy + sh/2)
      ctx.lineTo(sx + sw/2, sy + sh)
      ctx.lineTo(sx, sy + sh/2)
    } else if (agent.status === "error" || agent.status === "offline") { // X
      ctx.fillRect(sx, sy, sw, sh)
      ctx.strokeStyle = "#fff"
      ctx.lineWidth = 1
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + sw, sy + sh)
      ctx.moveTo(sx + sw, sy)
      ctx.lineTo(sx, sy + sh)
      ctx.stroke()
    } else { // Square
      ctx.rect(sx, sy, sw, sh)
    }
    ctx.fill()
  } else {
    ctx.fillRect(sx, sy, sw, sh)
  }

  // Status dot border
  ctx.strokeStyle = "#0a0e17"
  ctx.lineWidth = 0.5
  ctx.strokeRect(sx, sy, sw, sh)

  if (agent.deployment === "cloud") {
    ctx.save()
    ctx.font = "bold 7px monospace"
    ctx.textAlign = "center"
    ctx.fillStyle = "#0f172a"
    ctx.fillRect(drawX + 2, drawY - 9, 32, 9)
    ctx.strokeStyle = "#38bdf8"
    ctx.strokeRect(drawX + 2, drawY - 9, 32, 9)
    ctx.fillStyle = "#7dd3fc"
    ctx.fillText("CLOUD", drawX + 18, drawY - 2)
    ctx.restore()
  }

  // Name label
  ctx.font = "bold 8px monospace"
  ctx.textAlign = "center"
  ctx.fillStyle = "#000000"
  ctx.fillText(agent.name, cx + 1, y + spriteSize + 5)
  ctx.fillStyle = c
  ctx.fillText(agent.name, cx, y + spriteSize + 4)
  ctx.textAlign = "left"

  // Task progress bar
  if (agent.status === "working" && agent.taskProgress > 0) {
    const barW = 28
    const barH = 3
    const barX = cx - barW / 2
    const barY = y + spriteSize + 8
    drawRect(ctx, barX, barY, barW, barH, "#0a0e17")
    drawRect(ctx, barX, barY, Math.floor(barW * agent.taskProgress / 100), barH, c)
    ctx.strokeStyle = c + "44"
    ctx.lineWidth = 0.5
    ctx.strokeRect(barX, barY, barW, barH)
  }
}

export function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = "#1a223522"
  ctx.lineWidth = 0.5
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
}

export function drawScaffolding(ctx: CanvasRenderingContext2D, district: District, progress01: number) {
  // Simple scaffolding helper used by the construction animator.
  // Draws "rising" building silhouettes with 1px/2px scaffolding hints.
  const p = Math.max(0, Math.min(1, progress01))
  const buildingsBaseY = district.y + district.h - 64
  const bx1 = district.x + 8
  const bx2 = bx1 + 38
  const bx3 = district.x + district.w - 42

  const buildingSets = [
    { x: bx1, w: 30, h: 52 },
    { x: bx2, w: 24, h: 36 },
    { x: bx3, w: 28, h: 44 },
  ]

  ctx.save()
  ctx.beginPath()
  const radius = 8
  ctx.moveTo(district.x + radius, district.y)
  ctx.lineTo(district.x + district.w - radius, district.y)
  ctx.quadraticCurveTo(district.x + district.w, district.y, district.x + district.w, district.y + radius)
  ctx.lineTo(district.x + district.w, district.y + district.h - radius)
  ctx.quadraticCurveTo(district.x + district.w, district.y + district.h, district.x + district.w - radius, district.y + district.h)
  ctx.lineTo(district.x + radius, district.y + district.h)
  ctx.quadraticCurveTo(district.x, district.y + district.h, district.x, district.y + district.h - radius)
  ctx.lineTo(district.x, district.y + radius)
  ctx.quadraticCurveTo(district.x, district.y, district.x + radius, district.y)
  ctx.closePath()
  ctx.clip()

  for (let i = 0; i < buildingSets.length; i++) {
    const b = buildingSets[i]
    const stagger = i * 0.14
    const local = Math.max(0, Math.min(1, (p - stagger) / (1 - stagger)))
    const hNow = 2 + (b.h - 2) * local
    const topY = buildingsBaseY - hNow

    // 1px scaffolding "spine"
    ctx.strokeStyle = `${district.color}aa`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(b.x + 6, buildingsBaseY)
    ctx.lineTo(b.x + 6, buildingsBaseY - Math.max(1, Math.floor(hNow)))
    ctx.stroke()

    // Render building body clipped to current height
    const prevAlpha = ctx.globalAlpha
    ctx.globalAlpha = 0.2 + 0.8 * local
    ctx.save()
    ctx.beginPath()
    ctx.rect(b.x, topY, b.w, hNow)
    ctx.clip()
    drawBuilding(ctx, b.x, buildingsBaseY - b.h, b.w, b.h, district.color, 0)
    ctx.restore()
    ctx.globalAlpha = prevAlpha
  }

  ctx.restore()
}

export function drawRoads(ctx: CanvasRenderingContext2D, districts: District[]) {
  // Road shadows
  ctx.strokeStyle = "#0a0e17"
  ctx.lineWidth = 8
  ctx.setLineDash([])
  for (let i = 0; i < districts.length - 1; i++) {
    const a = districts[i]
    const b = districts[i + 1]
    ctx.beginPath()
    ctx.moveTo(a.x + a.w / 2, a.y + a.h / 2)
    ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2)
    ctx.stroke()
  }

  // Road surface
  ctx.strokeStyle = "#1e293b"
  ctx.lineWidth = 6
  for (let i = 0; i < districts.length - 1; i++) {
    const a = districts[i]
    const b = districts[i + 1]
    ctx.beginPath()
    ctx.moveTo(a.x + a.w / 2, a.y + a.h / 2)
    ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2)
    ctx.stroke()
  }

  // Dashed center line
  ctx.strokeStyle = "#2a3a52"
  ctx.lineWidth = 1
  ctx.setLineDash([6, 8])
  for (let i = 0; i < districts.length - 1; i++) {
    const a = districts[i]
    const b = districts[i + 1]
    ctx.beginPath()
    ctx.moveTo(a.x + a.w / 2, a.y + a.h / 2)
    ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2)
    ctx.stroke()
  }
  ctx.setLineDash([])
}
