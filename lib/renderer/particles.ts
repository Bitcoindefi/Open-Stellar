export type ParticleEvent = "xp-burst" | "payment-spark" | "level-up" | "badge-unlock" | "district-win"

export type ParticleKind = "text" | "spark" | "confetti" | "ray" | "ring" | "flash"

export type BadgeRarity = "common" | "uncommon" | "rare" | "epic" | "legendary"

export const RARITY_COLORS: Record<BadgeRarity, string> = {
  common: "#9ca3af",
  uncommon: "#4ade80",
  rare: "#60a5fa",
  epic: "#a78bfa",
  legendary: "#fbbf24",
}

export interface ParticleOpts {
  color?: string
  text?: string
  amount?: string
  level?: number
  rarity?: BadgeRarity
  spreadW?: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  alpha: number
  scale: number
  color: string
  type: ParticleKind
  life: number
  maxLife: number
  // Bookkeeping for specific particle kinds — set selectively by emit helpers.
  delay?: number
  baseAlpha?: number
  startX?: number
  startY?: number
  gravity?: number
  bounced?: boolean
  groundY?: number
  size?: number
  angle?: number
  radius?: number
  rotation?: number
  rotationSpeed?: number
  lineWidth?: number
  text?: string
  bold?: boolean
  fontSize?: number
  w?: number
  h?: number
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1))
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

export class ParticleSystem {
  particles: Particle[] = []

  emit(type: ParticleEvent, x: number, y: number, opts: ParticleOpts = {}): void {
    switch (type) {
      case "xp-burst":
        this.emitXpBurst(x, y, opts)
        break
      case "payment-spark":
        this.emitPaymentSpark(x, y, opts)
        break
      case "level-up":
        this.emitLevelUp(x, y, opts)
        break
      case "badge-unlock":
        this.emitBadgeUnlock(x, y, opts)
        break
      case "district-win":
        this.emitDistrictWin(x, y, opts)
        break
    }
  }

  private emitXpBurst(x: number, y: number, opts: ParticleOpts) {
    const color = opts.color ?? "#22d3ee"
    const count = randInt(6, 8)
    const maxLife = 1200

    for (let i = 0; i < count; i++) {
      const sx = x + rand(-10, 10)
      const sy = y + rand(-6, 2)
      const riseDistance = rand(20, 34)

      this.particles.push({
        x: sx,
        y: sy,
        startX: sx,
        startY: sy,
        vx: rand(-8, 8),
        vy: -(riseDistance / (maxLife / 1000)),
        alpha: 1,
        baseAlpha: 1,
        scale: 1,
        color,
        type: "text",
        text: "+XP",
        fontSize: 9,
        life: 0,
        maxLife,
        delay: i * 35,
      })
    }
  }

  private emitPaymentSpark(x: number, y: number, opts: ParticleOpts) {
    const sparkColor = opts.color ?? "#fbbf24"
    const maxLife = 800

    for (let i = 0; i < 12; i++) {
      const angle = rand(0, Math.PI * 2)
      const speed = rand(40, 100)

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        baseAlpha: 1,
        scale: 1,
        color: sparkColor,
        type: "spark",
        size: rand(1, 2),
        gravity: 480,
        groundY: y + rand(0, 6),
        life: 0,
        maxLife,
      })
    }

    const textLife = 1000
    const riseDistance = 30
    this.particles.push({
      x,
      y,
      startX: x,
      startY: y,
      vx: 0,
      vy: -(riseDistance / (textLife / 1000)),
      alpha: 1,
      baseAlpha: 1,
      scale: 1,
      color: "#fbbf24",
      type: "text",
      text: opts.amount ?? opts.text ?? "+0.01 XLM",
      fontSize: 10,
      bold: true,
      life: 0,
      maxLife: textLife,
    })
  }

  private emitLevelUp(x: number, y: number, opts: ParticleOpts) {
    const color = opts.color ?? "#fbbf24"
    const level = opts.level ?? 0
    const rayLife = 700

    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2
      this.particles.push({
        x,
        y,
        vx: rand(70, 110),
        vy: 0,
        alpha: 1,
        baseAlpha: 1,
        scale: 1,
        color,
        type: "ray",
        angle,
        size: 2,
        life: 0,
        maxLife: rayLife,
      })
    }

    this.particles.push({
      x,
      y,
      vx: 60,
      vy: 0,
      alpha: 1,
      baseAlpha: 1,
      scale: 1,
      color,
      type: "ring",
      size: 4,
      lineWidth: 2,
      life: 0,
      maxLife: 750,
    })

    const textLife = 1500
    const riseDistance = 40
    this.particles.push({
      x,
      y,
      startX: x,
      startY: y,
      vx: 0,
      vy: -(riseDistance / (textLife / 1000)),
      alpha: 1,
      baseAlpha: 1,
      scale: 1,
      color,
      type: "text",
      text: `LVL ${level}`,
      fontSize: 13,
      bold: true,
      life: 0,
      maxLife: textLife,
    })

    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      alpha: 0.3,
      baseAlpha: 0.3,
      scale: 1,
      color: "#ffffff",
      type: "flash",
      w: 56,
      h: 56,
      life: 0,
      maxLife: 100,
    })
  }

  private emitBadgeUnlock(x: number, y: number, opts: ParticleOpts) {
    const rarity = opts.rarity ?? "common"
    const color = opts.color ?? RARITY_COLORS[rarity]
    const maxLife = 2000

    for (let i = 0; i < 20; i++) {
      const angle = rand(0, Math.PI * 2)
      const speed = rand(30, 90)

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - rand(20, 60),
        alpha: 1,
        baseAlpha: 1,
        scale: 1,
        color,
        type: "confetti",
        size: rand(2, 4),
        gravity: 220,
        rotation: rand(0, Math.PI * 2),
        rotationSpeed: rand(-4, 4),
        life: 0,
        maxLife,
      })
    }
  }

  private emitDistrictWin(x: number, y: number, opts: ParticleOpts) {
    const color = opts.color ?? "#facc15"
    const spreadW = opts.spreadW ?? 100
    const burstCount = randInt(3, 5)
    const rayLife = 900

    for (let b = 0; b < burstCount; b++) {
      const bx = x + rand(-spreadW / 2, spreadW / 2)
      const by = y + rand(-30, 10)
      const delay = b * 220 + rand(0, 80)

      for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2
        this.particles.push({
          x: bx,
          y: by,
          vx: rand(70, 130),
          vy: 0,
          alpha: 1,
          baseAlpha: 1,
          scale: 1,
          color,
          type: "ray",
          angle,
          size: 2,
          life: 0,
          maxLife: rayLife,
          delay,
        })
      }
    }
  }

  update(dtMs: number): void {
    if (dtMs <= 0 || this.particles.length === 0) return
    const next: Particle[] = []

    for (const p of this.particles) {
      if (p.delay && p.delay > 0) {
        p.delay -= dtMs
        next.push(p)
        continue
      }

      p.life += dtMs
      if (p.life >= p.maxLife) continue
      const t = p.life / p.maxLife

      switch (p.type) {
        case "text": {
          p.x = (p.startX ?? p.x) + (p.vx * p.life) / 1000
          p.y = (p.startY ?? p.y) + (p.vy * p.life) / 1000
          p.alpha = (p.baseAlpha ?? 1) * (1 - t)
          break
        }
        case "ray": {
          p.radius = 4 + (p.vx * p.life) / 1000
          p.alpha = (p.baseAlpha ?? 1) * (t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75)
          break
        }
        case "ring": {
          p.radius = (p.size ?? 4) + (p.vx * p.life) / 1000
          p.alpha = (p.baseAlpha ?? 1) * (1 - t)
          break
        }
        case "flash": {
          p.alpha = (p.baseAlpha ?? 0.3) * (1 - t)
          break
        }
        case "spark": {
          const dtSec = dtMs / 1000
          p.vy += (p.gravity ?? 480) * dtSec
          p.x += p.vx * dtSec
          p.y += p.vy * dtSec
          if (!p.bounced && p.groundY !== undefined && p.y >= p.groundY && p.vy > 0) {
            p.vy = -p.vy * 0.45
            p.bounced = true
          }
          p.alpha = (p.baseAlpha ?? 1) * (1 - t)
          p.scale = 1 - t * 0.4
          break
        }
        case "confetti": {
          const dtSec = dtMs / 1000
          p.vy += (p.gravity ?? 220) * dtSec
          p.x += p.vx * dtSec
          p.y += p.vy * dtSec
          p.rotation = (p.rotation ?? 0) + (p.rotationSpeed ?? 0) * dtSec
          p.alpha = (p.baseAlpha ?? 1) * (t > 0.75 ? Math.max(0, 1 - (t - 0.75) / 0.25) : 1)
          break
        }
      }

      next.push(p)
    }

    this.particles = next
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      if (p.delay && p.delay > 0) continue
      if (p.alpha <= 0) continue

      ctx.save()
      ctx.globalAlpha = clamp01(p.alpha)

      switch (p.type) {
        case "text": {
          ctx.font = `${p.bold ? "bold " : ""}${p.fontSize ?? 10}px monospace`
          ctx.fillStyle = p.color
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(p.text ?? "", p.x, p.y)
          break
        }
        case "spark": {
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, Math.max(0.5, (p.size ?? 1.5) * p.scale), 0, Math.PI * 2)
          ctx.fill()
          break
        }
        case "confetti": {
          const s = (p.size ?? 3) * p.scale
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rotation ?? 0)
          ctx.fillStyle = p.color
          ctx.fillRect(-s / 2, -s / 2, s, s)
          break
        }
        case "ray": {
          const r0 = 4
          const r1 = p.radius ?? r0
          const angle = p.angle ?? 0
          ctx.strokeStyle = p.color
          ctx.lineWidth = p.size ?? 2
          ctx.beginPath()
          ctx.moveTo(p.x + Math.cos(angle) * r0, p.y + Math.sin(angle) * r0)
          ctx.lineTo(p.x + Math.cos(angle) * r1, p.y + Math.sin(angle) * r1)
          ctx.stroke()
          break
        }
        case "ring": {
          ctx.strokeStyle = p.color
          ctx.lineWidth = p.lineWidth ?? 2
          ctx.beginPath()
          ctx.arc(p.x, p.y, Math.max(0, p.radius ?? 0), 0, Math.PI * 2)
          ctx.stroke()
          break
        }
        case "flash": {
          ctx.fillStyle = p.color
          ctx.fillRect(p.x - (p.w ?? 40) / 2, p.y - (p.h ?? 40) / 2, p.w ?? 40, p.h ?? 40)
          break
        }
      }

      ctx.restore()
    }
  }
}
