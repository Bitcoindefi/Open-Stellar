"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import type { MoltbotAgent, District } from "@/lib/types"
import { drawGrid, drawRoads, drawDistrict, drawBot } from "@/lib/renderer"

const BG_IMAGES: Record<string, string> = {
  "data-center": "/bg-data-center.jpg",
  "comm-hub": "/bg-comm-hub.jpg",
  processing: "/bg-processing.jpg",
  defense: "/bg-defense.jpg",
  research: "/bg-research.jpg",
}

interface SpriteConfig {
  path: string
  crop?: [number, number, number, number]
}

const SPRITE_CONFIGS: SpriteConfig[] = [
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

interface PixelCityProps {
  agents: MoltbotAgent[]
  districts: District[]
  selectedAgentId: string | null
  onSelectAgent: (id: string | null) => void
  tick: number
  txAnimations?: TxAnimation[]
  colorBlindMode?: boolean
  reduceMotion?: boolean
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
}: PixelCityProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
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
  }, [])

  useEffect(() => {
    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)
    return () => window.removeEventListener("resize", resizeCanvas)
  }, [resizeCanvas])

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
      drawDistrict(ctx, d, tick, images[d.id])
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
  }, [agents, districts, selectedAgentId, tick, images, sprites, txAnimations, reduceMotion])

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
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const found = hitTestAgent(mx, my)
      onSelectAgent(found?.id ?? null)
    },
    [hitTestAgent, onSelectAgent]
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
    active: "#34d399", working: "#fbbf24", idle: "#64748b", error: "#f87171", offline: "#1e293b",
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

