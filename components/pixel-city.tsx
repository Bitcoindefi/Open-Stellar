"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import type { MoltbotAgent, District } from "@/lib/types"
import { drawGrid, drawRoads, drawDistrict, drawBot } from "@/lib/renderer"
import type { DistrictStanding } from "@/lib/gamification/events"
import { ParticleSystem, type ParticleEvent, type ParticleOpts } from "@/lib/renderer/particles"
import type { CityAudioEngine } from "@/lib/audio/city-audio"

const BG_IMAGES: Record<string, string> = {
  "data-center": "/bg-data-center.jpg",
  "comm-hub": "/bg-comm-hub.jpg",
  processing: "/bg-processing.jpg",
  defense: "/bg-defense.jpg",
  research: "/bg-research.jpg",
}

export interface SpriteConfig {
  path: string
  crop?: [number, number, number, number]
}

export interface FloatingOverlay {
  id: number
  x: number
  y: number
  text: string
  color: string
  startedAt: number
  duration: number
}

export const SPRITE_CONFIGS: SpriteConfig[] = [
  { path: "/sprites/robot-tv.gif" },
  { path: "/sprites/robot-tank.gif" },
  { path: "/sprites/robot-blue.gif", crop: [0.3, 0.5, 0.4, 0.5] },
  { path: "/sprites/robot-gold.gif" },
  { path: "/sprites/robot-runner.gif", crop: [0.5, 0, 0.5, 1] },
  { path: "/sprites/robot-heavy.webp" },
  { path: "/sprites/robot-green.gif" },
]

export interface TxAnimation {
  id: number
  fromX: number
  fromY: number
  toX: number
  toY: number
  startedAt: number
  duration: number
}

export interface ParticleTrigger {
  id: number
  type: ParticleEvent
  x: number
  y: number
  opts?: ParticleOpts
}

interface PixelCityProps {
  agents: MoltbotAgent[]
  districts: District[]
  selectedAgentId: string | null
  onSelectAgent: (id: string | null) => void
  tick: number
  txAnimations?: TxAnimation[]
  colorBlindMode?: boolean
  reduceMotion?: boolean
  floatingOverlays?: FloatingOverlay[]
  particleTriggers?: ParticleTrigger[]
  audioEngine?: CityAudioEngine
  districtStandings?: DistrictStanding[]
}

const statusSymbols: Record<string, string> = {
  active: "+",
  working: "*",
  idle: "o",
  error: "x",
  offline: "-",
}

export function PixelCity({
  agents,
  districts,
  selectedAgentId,
  onSelectAgent,
  tick,
  txAnimations = [],
  colorBlindMode = false,
  reduceMotion = false,
  floatingOverlays = [],
  particleTriggers = [],
  audioEngine,
  districtStandings = [],
}: PixelCityProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particleCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const particleSystemRef = useRef<ParticleSystem>(new ParticleSystem())
  const processedParticleIdsRef = useRef<Set<number>>(new Set())
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({})
  const [sprites, setSprites] = useState<HTMLImageElement[]>([])
  const spriteCrops = useRef<(([number, number, number, number]) | undefined)[]>([])
  const [hoveredAgent, setHoveredAgent] = useState<MoltbotAgent | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null)

  // Preload all background images and robot sprites
  useEffect(() => {
    const loaded: Record<string, HTMLImageElement> = {}
    const loadedSprites: (HTMLImageElement | null)[] = new Array(SPRITE_CONFIGS.length).fill(null)
    const crops: (([number, number, number, number]) | undefined)[] = SPRITE_CONFIGS.map(c => c.crop)
    spriteCrops.current = crops
    let count = 0
    const totalBg = Object.keys(BG_IMAGES).length
    const totalSprites = SPRITE_CONFIGS.length
    const total = totalBg + totalSprites

    const checkDone = () => {
      if (count === total) {
        setImages({ ...loaded })
        setSprites(loadedSprites.filter(Boolean) as HTMLImageElement[])
      }
    }

    Object.entries(BG_IMAGES).forEach(([key, src]) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => { loaded[key] = img; count++; checkDone() }
      img.onerror = () => { count++; checkDone() }
      img.src = src
    })

    SPRITE_CONFIGS.forEach((cfg, idx) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => { loadedSprites[idx] = img; count++; checkDone() }
      img.onerror = () => { count++; checkDone() }
      img.src = cfg.path
    })
  }, [])

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const particleCanvas = particleCanvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const ctx = canvas.getContext("2d")
    if (ctx) ctx.scale(dpr, dpr)

    if (particleCanvas) {
      particleCanvas.width = rect.width * dpr
      particleCanvas.height = rect.height * dpr
      particleCanvas.style.width = `${rect.width}px`
      particleCanvas.style.height = `${rect.height}px`
      const pctx = particleCanvas.getContext("2d")
      if (pctx) pctx.scale(dpr, dpr)
    }
  }, [])

  useEffect(() => {
    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)
    return () => window.removeEventListener("resize", resizeCanvas)
  }, [resizeCanvas])

  // Consume declarative particle triggers fired from SSE events (XP, payments, level-ups, badges, district wins).
  useEffect(() => {
    const system = particleSystemRef.current
    const currentIds = new Set(particleTriggers.map((trigger) => trigger.id))

    for (const trigger of particleTriggers) {
      if (processedParticleIdsRef.current.has(trigger.id)) continue
      processedParticleIdsRef.current.add(trigger.id)
      system.emit(trigger.type, trigger.x, trigger.y, trigger.opts)
    }

    for (const id of processedParticleIdsRef.current) {
      if (!currentIds.has(id)) processedParticleIdsRef.current.delete(id)
    }
  }, [particleTriggers])

  // Drive the particle system on its own animation-frame loop, independent of the
  // tick-driven city redraw, so physics (gravity, bounce, rise/fade) stay smooth.
  useEffect(() => {
    if (reduceMotion) return
    let frameId: number
    let lastTime = performance.now()

    const loop = (now: number) => {
      const dt = Math.min(now - lastTime, 50)
      lastTime = now
      const system = particleSystemRef.current
      system.update(dt)

      const canvas = particleCanvasRef.current
      const ctx = canvas?.getContext("2d")
      if (ctx && canvas) {
        const dpr = window.devicePixelRatio || 1
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
        system.draw(ctx)
      }

      frameId = requestAnimationFrame(loop)
    }

    frameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameId)
  }, [reduceMotion])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.width / dpr
    const h = canvas.height / dpr

    ctx.clearRect(0, 0, w, h)

    drawGrid(ctx, w, h)
    drawRoads(ctx, districts)

    for (const d of districts) {
      const standing = districtStandings.find((candidate) => candidate.districtId === d.id)
      drawDistrict(ctx, d, tick, images[d.id], standing ? {
        scoreLabel: standing.formattedScore,
        rank: standing.rank,
        multiplier: standing.multiplier,
        isLeading: standing.rank === 1,
      } : undefined)
    }

    const sorted = [...agents].sort((a, b) => a.pixelY - b.pixelY)
    for (const agent of sorted) {
      const spriteIdx = agent.spriteId % sprites.length
      const agentSprite = sprites[spriteIdx] || sprites[0]
      const crop = spriteCrops.current[agent.spriteId % SPRITE_CONFIGS.length]
      drawBot(ctx, agent, tick, agent.id === selectedAgentId, agentSprite, crop)
    }

    if (!reduceMotion) {
      const now = Date.now()
      for (const anim of txAnimations) {
        const elapsed = now - anim.startedAt
        const t = Math.min(1, elapsed / anim.duration)
        if (t >= 1) continue

        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t

        ctx.save()
        ctx.globalAlpha = Math.sin(t * Math.PI) * 0.85
        ctx.strokeStyle = "#fbbf24"
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.lineDashOffset = -elapsed * 0.08

        const headX = anim.fromX + (anim.toX - anim.fromX) * eased
        const headY = anim.fromY + (anim.toY - anim.fromY) * eased

        ctx.beginPath()
        ctx.moveTo(anim.fromX, anim.fromY)
        ctx.lineTo(headX, headY)
        ctx.stroke()

        ctx.setLineDash([])
        ctx.globalAlpha = Math.sin(t * Math.PI)
        ctx.fillStyle = "#fbbf24"
        ctx.beginPath()
        ctx.arc(headX, headY, 4, 0, Math.PI * 2)
        ctx.fill()

        ctx.restore()
      }
    }

    ctx.font = "bold 14px monospace"
    ctx.fillStyle = "#22d3ee"
    ctx.textAlign = "left"
    ctx.fillText("MOLTBOT CITY", 40, 30)
    ctx.font = "10px monospace"
    ctx.fillStyle = "#64748b"
    ctx.fillText(`TICK ${tick}  |  ${agents.length} AGENTS DEPLOYED`, 40, 44)

    if (audioEngine) {
      const weights = new Map<string, number>()
      for (const d of districts) weights.set(d.id, 0)
      for (const agent of agents) {
        if (agent.status === "offline") continue
        const visualDistrict = districts.find(
          (d) => agent.pixelX >= d.x && agent.pixelX <= d.x + d.w && agent.pixelY >= d.y && agent.pixelY <= d.y + d.h
        )
        const id = visualDistrict?.id ?? agent.district
        const presence = agent.status === "working" ? 1.5 : 1
        weights.set(id, (weights.get(id) ?? 0) + presence)
      }
      const maxWeight = Math.max(1, ...weights.values())
      for (const d of districts) {
        const volume = 0.18 + 0.82 * ((weights.get(d.id) ?? 0) / maxWeight)
        audioEngine.setDistrictFocus(d.id, volume)
      }
    }
  }, [agents, districts, selectedAgentId, tick, images, sprites, txAnimations, reduceMotion, audioEngine, districtStandings])

  const hitTestAgent = useCallback(
    (mx: number, my: number): MoltbotAgent | null => {
      for (const agent of agents) {
        const dx = mx - (agent.pixelX + 8)
        const dy = my - (agent.pixelY + 10)
        if (Math.sqrt(dx * dx + dy * dy) < 16) return agent
      }
      return null
    },
    [agents]
  )

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      audioEngine?.init()
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const found = hitTestAgent(mx, my)
      onSelectAgent(found?.id ?? null)
    },
    [audioEngine, hitTestAgent, onSelectAgent]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const found = hitTestAgent(mx, my)
      setHoveredAgent(found)
      if (found) {
        setTooltipPos({ x: mx + 12, y: my - 8 })
        canvas.style.cursor = "pointer"
      } else {
        setTooltipPos(null)
        canvas.style.cursor = "crosshair"
      }
    },
    [hitTestAgent]
  )

  const handleMouseLeave = useCallback(() => {
    setHoveredAgent(null)
    setTooltipPos(null)
    const canvas = canvasRef.current
    if (canvas) canvas.style.cursor = "crosshair"
  }, [])

  const handleCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (e.key === "Escape") {
        onSelectAgent(null)
      }
    },
    [onSelectAgent]
  )

  const statusColors: Record<string, string> = {
    active: "#34d399", working: "#fbbf24", idle: "#64748b", error: "#f87171", offline: "#f87171",
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      {/* Full-viewport animated city GIF background */}
      <img
        src="/bg-city.gif"
        alt=""
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: 0,
          pointerEvents: "none",
          imageRendering: "pixelated",
        }}
      />
      <canvas
        ref={canvasRef}
        role="img"
        tabIndex={0}
        aria-label={`Open Stellar pixel city with ${agents.length} agents deployed. Tab to focus individual agents.`}
        onClick={handleClick}
        onKeyDown={handleCanvasKeyDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          cursor: "crosshair",
          display: "block",
          imageRendering: "pixelated",
          position: "relative",
          zIndex: 1,
        }}
      />
      <canvas
        ref={particleCanvasRef}
        aria-hidden="true"
        style={{
          display: "block",
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 2,
          pointerEvents: "none",
        }}
      />
      <div aria-label="Agents on city canvas" role="listbox">
        {agents.map((agent) => {
          const isSelected = agent.id === selectedAgentId
          const isFocused = agent.id === focusedAgentId

          return (
            <button
              key={agent.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-label={`${agent.name}, ${agent.status}, ${agent.currentTask ?? "no active task"}`}
              onFocus={() => setFocusedAgentId(agent.id)}
              onBlur={() => setFocusedAgentId((current) => (current === agent.id ? null : current))}
              onClick={() => onSelectAgent(agent.id)}
              style={{
                position: "absolute",
                left: agent.pixelX - 4,
                top: agent.pixelY - 4,
                zIndex: 4,
                width: 32,
                height: 32,
                border: isFocused || isSelected ? "2px solid #fbbf24" : "1px solid transparent",
                borderRadius: 8,
                background: colorBlindMode ? "rgba(15,23,42,0.55)" : "transparent",
                color: "#f8fafc",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 14,
                lineHeight: "28px",
                padding: 0,
                outline: isFocused ? "2px solid #22d3ee" : "none",
                outlineOffset: 2,
              }}
            >
              <span aria-hidden="true">{colorBlindMode ? statusSymbols[agent.status] ?? "•" : ""}</span>
            </button>
          )
        })}
      </div>
      {floatingOverlays.map((overlay) => {
        const elapsed = Date.now() - overlay.startedAt
        const progress = Math.min(1, elapsed / overlay.duration)
        const lift = Math.round(progress * 28)
        const fade = Math.max(0, 1 - progress)

        return (
          <div
            key={overlay.id}
            style={{
              position: "absolute",
              left: overlay.x,
              top: overlay.y - lift,
              transform: "translate(-50%, -100%)",
              zIndex: 9,
              pointerEvents: "none",
              color: overlay.color,
              opacity: fade,
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 700,
              textShadow: "0 2px 8px rgba(0,0,0,0.7)",
              background: "rgba(3,7,18,0.35)",
              border: `1px solid ${overlay.color}33`,
              borderRadius: 6,
              padding: "2px 6px",
              whiteSpace: "nowrap",
            }}
          >
            {overlay.text}
          </div>
        )
      })}
      {/* Agent hover tooltip */}
      {hoveredAgent && tooltipPos && (
        <div
          style={{
            position: "absolute",
            left: tooltipPos.x,
            top: tooltipPos.y,
            zIndex: 10,
            background: "#111827",
            border: "1px solid #2a3a52",
            borderRadius: 6,
            padding: "6px 10px",
            pointerEvents: "none",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColors[hoveredAgent.status] ?? "#64748b" }} />
            <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: hoveredAgent.color }}>
              {hoveredAgent.name}
            </span>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#64748b", lineHeight: 1.5 }}>
            <div>{hoveredAgent.status.toUpperCase()} · CPU {Math.round(hoveredAgent.cpu)}%</div>
            {hoveredAgent.status === "offline" && (
              <div style={{ color: "#f87171" }}>
                Offline for {Math.floor((hoveredAgent.offlineForSeconds ?? 0) / 60)}m
              </div>
            )}
            {hoveredAgent.lastHeartbeat && (
              <div>Last seen {new Date(hoveredAgent.lastHeartbeat).toLocaleTimeString()}</div>
            )}
            {hoveredAgent.currentTask && (
              <div style={{ color: "#94a3b8", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {hoveredAgent.currentTask}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

