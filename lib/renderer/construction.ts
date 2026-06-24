import type { District } from "../types"
import { drawBuilding } from "../renderer"

function lighten(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount)
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount)
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

const PHASE_1_MS = 3000
const PHASE_2_MS = 4000
const PHASE_3_MS = 5000
const PHASE_4_MS = 3000
const TOTAL_MS = PHASE_1_MS + PHASE_2_MS + PHASE_3_MS + PHASE_4_MS

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

function frac(ms: number, totalMs: number) {
  if (totalMs <= 0) return 1
  return clamp01(ms / totalMs)
}

function drawGridReveal(ctx: CanvasRenderingContext2D, d: District, t: number) {
  const rows = Math.max(6, Math.floor(d.h / 24))
  const cols = Math.max(6, Math.floor(d.w / 24))
  const reveal = Math.floor(lerp(0, rows * cols, easeOutCubic(t)))

  const wStep = d.w / cols
  const hStep = d.h / rows

  ctx.save()
  ctx.globalAlpha = lerp(0, 1, t)
  ctx.strokeStyle = `${d.color}aa`
  ctx.lineWidth = 1

  let count = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (count++ > reveal) break
      const x = d.x + c * wStep
      const y = d.y + r * hStep
      ctx.strokeRect(Math.round(x), Math.round(y), Math.ceil(wStep), Math.ceil(hStep))
      if (count > reveal) break
    }
    if (count > reveal) break
  }

  ctx.restore()
}

function drawCrane(ctx: CanvasRenderingContext2D, d: District, t: number) {
  const appear = easeOutCubic(clamp01(t / 0.35))
  const x0 = d.x + 10
  const y0 = d.y + 14
  const bob = Math.sin(t * 10) * 1.5

  ctx.save()
  ctx.globalAlpha = appear
  ctx.strokeStyle = `${d.color}ff`
  ctx.lineWidth = 2

  ctx.fillStyle = `${d.color}33`
  ctx.fillRect(x0 - 2, y0 + 18, 6, 4)

  ctx.beginPath()
  ctx.moveTo(x0 + 1, y0 + 20)
  ctx.lineTo(x0 + 1, y0 + bob)
  ctx.stroke()

  const armT = clamp01((t - 0.1) / 0.6)
  const armLen = lerp(0, 22, easeOutCubic(armT))
  ctx.beginPath()
  ctx.moveTo(x0 + 1, y0 + bob)
  ctx.lineTo(x0 + 1 + armLen, y0 + bob - 10)
  ctx.stroke()

  ctx.fillStyle = `${d.color}ff`
  ctx.fillRect(x0 + 1 + armLen - 2, y0 + bob - 10, 4, 4)

  ctx.restore()
}

export function drawConstruction(
  ctx: CanvasRenderingContext2D,
  district: District,
  progress01: number,
  tick: number,
  opts?: {
    backgroundImage?: HTMLImageElement
  }
) {
  const p = clamp01(progress01)
  const elapsedMs = p * TOTAL_MS

  const p1 = Math.min(PHASE_1_MS, elapsedMs)
  const p2 = Math.min(PHASE_2_MS, Math.max(0, elapsedMs - PHASE_1_MS))
  const p3 = Math.min(PHASE_3_MS, Math.max(0, elapsedMs - PHASE_1_MS - PHASE_2_MS))
  const p4 = Math.max(0, elapsedMs - PHASE_1_MS - PHASE_2_MS - PHASE_3_MS)

  if (elapsedMs <= PHASE_1_MS) {
    drawGridReveal(ctx, district, frac(p1, PHASE_1_MS))
    drawCrane(ctx, district, frac(p1, PHASE_1_MS))
    return
  }

  drawGridReveal(ctx, district, 1)
  drawCrane(ctx, district, 1)

  // Phase 2 (3–7s): scaffolding + sparks + buildings rise
  const scaffT = frac(p2, PHASE_2_MS)
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

  // Sparks
  const sparksCount = 18
  const sparkIntensity = easeOutCubic(scaffT)
  for (let i = 0; i < sparksCount; i++) {
    const seed = i * 91.17
    const localT = (tick * 0.02 + seed) % 1
    const sx = lerp(district.x + 10, district.x + district.w - 10, (Math.sin(seed) * 0.5 + 0.5))
    const siteY = buildingsBaseY + 40 - (Math.sin(seed * 0.3 + tick * 0.05) * 2)
    const fall = localT < sparkIntensity ? localT / Math.max(0.001, sparkIntensity) : 1
    const sy = lerp(siteY - 8, siteY + 26, fall)
    const len = lerp(10, 2, fall)
    const alpha = lerp(0, 0.9, sparkIntensity) * (1 - fall)

    ctx.strokeStyle = `rgba(249,115,22,${alpha.toFixed(3)})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx, sy + len)
    ctx.stroke()
  }

  // Buildings
  for (let i = 0; i < buildingSets.length; i++) {
    const b = buildingSets[i]
    const stagger = i * 0.14
    const local = clamp01((scaffT - stagger) / (1 - stagger))
    const hNow = lerp(2, b.h, easeOutCubic(local))
    const topY = buildingsBaseY - hNow

    ctx.strokeStyle = `${district.color}aa`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(b.x + 6, buildingsBaseY)
    ctx.lineTo(b.x + 6, buildingsBaseY - Math.max(1, Math.floor(hNow)))
    ctx.stroke()

    const prevAlpha = ctx.globalAlpha
    ctx.globalAlpha = lerp(0.2, 1, local)

    ctx.save()
    ctx.beginPath()
    ctx.rect(b.x, topY, b.w, hNow)
    ctx.clip()
    drawBuilding(ctx, b.x, buildingsBaseY - b.h, b.w, b.h, district.color, tick)
    ctx.restore()

    ctx.globalAlpha = prevAlpha
  }

  ctx.restore()

  // Phase 3 (7–12s): decoration
  const decoT = frac(p3, PHASE_3_MS)
  if (decoT > 0) {
    const bgImage = opts?.backgroundImage
    ctx.save()
    const fade = easeOutCubic(decoT)
    ctx.globalAlpha = fade * 0.95

    if (bgImage) {
      ctx.drawImage(bgImage, district.x, district.y, district.w, district.h)
      ctx.fillStyle = district.bgColor + "cc"
      ctx.fillRect(district.x, district.y, district.w, district.h)
    } else {
      ctx.fillStyle = district.bgColor
      ctx.fillRect(district.x, district.y, district.w, district.h)
    }

    ctx.restore()

    // Animated border stroke (approx via lineDash)
    const strokeProgress = easeOutCubic(decoT)
    ctx.save()
    ctx.strokeStyle = district.color
    ctx.lineWidth = 2
    ctx.globalAlpha = fade

    const pathLen = 2 * (district.w + district.h)
    const dash = pathLen * strokeProgress
    ctx.setLineDash([dash, pathLen])
    ctx.lineDashOffset = 0

    const radius2 = 8
    ctx.beginPath()
    ctx.moveTo(district.x + radius2, district.y)
    ctx.lineTo(district.x + district.w - radius2, district.y)
    ctx.quadraticCurveTo(district.x + district.w, district.y, district.x + district.w, district.y + radius2)
    ctx.lineTo(district.x + district.w, district.y + district.h - radius2)
    ctx.quadraticCurveTo(district.x + district.w, district.y + district.h, district.x + district.w - radius2, district.y + district.h)
    ctx.lineTo(district.x + radius2, district.y + district.h)
    ctx.quadraticCurveTo(district.x, district.y + district.h, district.x, district.y + district.h - radius2)
    ctx.lineTo(district.x, district.y + radius2)
    ctx.quadraticCurveTo(district.x, district.y, district.x + radius2, district.y)
    ctx.closePath()
    ctx.stroke()

    ctx.setLineDash([])
    ctx.restore()

    // Typewriter sign
    const signReveal = clamp01((decoT - 0.55) / 0.45)
    if (signReveal > 0) {
      ctx.save()
      const name = district.name.toUpperCase()
      const shown = name.slice(0, Math.max(0, Math.floor(name.length * signReveal)))

      ctx.font = "bold 10px monospace"
      const labelW = ctx.measureText(name).width + 12
      ctx.fillStyle = district.bgColor + "dd"
      ctx.fillRect(district.x + 6, district.y + 6, labelW, 18)
      ctx.fillStyle = district.color
      ctx.globalAlpha = fade
      ctx.fillText(shown, district.x + 12, district.y + 18)
      ctx.restore()
    }
  }

  // Phase 4 (12–15s): celebration fireworks
  const doneT = frac(p4, PHASE_4_MS)
  if (doneT >= 0 && doneT <= 1) {
    // Draw fireworks after a small threshold
    if (doneT > 0.35) {
      drawFireworks(ctx, district, tick)
    }
  }
}

function drawFireworks(ctx: CanvasRenderingContext2D, d: District, tick: number) {
  const cx = d.x + d.w / 2
  const cy = d.y + 20
  const particles = 28

  ctx.save()
  for (let i = 0; i < particles; i++) {
    const seed = i * 12.345
    const ang = ((Math.sin(seed) * 0.5 + 0.5) * Math.PI * 2)
    const speed = 12 + (Math.sin(seed * 2) * 0.5 + 0.5) * 22
    const local = (tick * 0.08 + i * 0.07) % 1
    const r = speed * local
    const x = cx + Math.cos(ang) * r
    const y = cy + Math.sin(ang) * r - local * 10

    const alpha = Math.max(0, 1 - local)
    const hue = (i * 9 + tick * 3) % 360
    ctx.fillStyle = `hsla(${hue}, 90%, 60%, ${alpha})`
    ctx.fillRect(x, y, 2, 2)
  }
  ctx.restore()
}

