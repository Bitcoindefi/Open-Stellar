"use client"

import { useCallback, useEffect, useState } from "react"
import { SlidersHorizontal, Volume2, VolumeX } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import type { CityAudioEngine } from "@/lib/audio/city-audio"

const VOLUME_KEY = "city-volume"
const MUTED_KEY = "city-muted"
const AMBIENCE_KEY = "city-ambience-volume"
const EFFECTS_KEY = "city-effects-volume"
const DEFAULT_VOLUME = 0.7
const DEFAULT_AMBIENCE = 0.42
const DEFAULT_EFFECTS = 0.72

interface AudioControlsProps {
  engine: CityAudioEngine
  bottomOffset?: string | number
}

function readStoredVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME
  const stored = window.localStorage.getItem(VOLUME_KEY)
  const parsed = stored !== null ? Number.parseFloat(stored) : NaN
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : DEFAULT_VOLUME
}

function readStoredMuted(): boolean {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(MUTED_KEY) === "true"
}

function readStoredLevel(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback
  const stored = window.localStorage.getItem(key)
  const parsed = stored !== null ? Number.parseFloat(stored) : NaN
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback
}

export function AudioControls({ engine, bottomOffset = 16 }: AudioControlsProps) {
  const [volume, setVolume] = useState(DEFAULT_VOLUME)
  const [ambience, setAmbience] = useState(DEFAULT_AMBIENCE)
  const [effects, setEffects] = useState(DEFAULT_EFFECTS)
  const [muted, setMuted] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Apply persisted preferences to the engine once on mount.
  useEffect(() => {
    const initialVolume = readStoredVolume()
    const initialMuted = readStoredMuted()
    const initialAmbience = readStoredLevel(AMBIENCE_KEY, DEFAULT_AMBIENCE)
    const initialEffects = readStoredLevel(EFFECTS_KEY, DEFAULT_EFFECTS)
    setVolume(initialVolume)
    setMuted(initialMuted)
    setAmbience(initialAmbience)
    setEffects(initialEffects)
    engine.setVolume(initialVolume)
    engine.setMuted(initialMuted)
    engine.setAmbienceVolume(initialAmbience)
    engine.setEffectsVolume(initialEffects)
  }, [engine])

  // Unlock the AudioContext on the first user gesture anywhere on the page.
  useEffect(() => {
    const unlock = () => engine.init()
    window.addEventListener("pointerdown", unlock, { once: true })
    window.addEventListener("keydown", unlock, { once: true })
    return () => {
      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("keydown", unlock)
    }
  }, [engine])

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev
      engine.setMuted(next)
      if (!next) void engine.init()
      window.localStorage.setItem(MUTED_KEY, String(next))
      return next
    })
  }, [engine])

  // "S" toggles mute, ignored while typing in a text field.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "s") return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return
      toggleMuted()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleMuted])

  const handleVolumeChange = useCallback(
    ([next]: number[]) => {
      setVolume(next)
      engine.setVolume(next)
      window.localStorage.setItem(VOLUME_KEY, String(next))
    },
    [engine],
  )

  const handleAmbienceChange = useCallback(([next]: number[]) => {
    setAmbience(next)
    engine.setAmbienceVolume(next)
    window.localStorage.setItem(AMBIENCE_KEY, String(next))
  }, [engine])

  const handleEffectsChange = useCallback(([next]: number[]) => {
    setEffects(next)
    engine.setEffectsVolume(next)
    window.localStorage.setItem(EFFECTS_KEY, String(next))
  }, [engine])

  return (
    <div
      style={{
        position: "absolute",
        bottom: bottomOffset,
        right: 16,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "7px 9px",
        background: "rgba(3,7,18,0.92)",
        border: "1px solid rgba(34,211,238,0.32)",
        borderRadius: 10,
        boxShadow: "0 8px 26px rgba(0,0,0,0.42)",
        backdropFilter: "blur(12px)",
      }}
    >
      <button
        type="button"
        onClick={toggleMuted}
        aria-label={muted ? "Unmute city audio (S)" : "Mute city audio (S)"}
        aria-pressed={muted}
        title={muted ? "Unmute (S)" : "Mute (S)"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 34,
          height: 34,
          borderRadius: 8,
          background: "transparent",
          border: "none",
          color: muted ? "#64748b" : "#22d3ee",
          cursor: "pointer",
          padding: 0,
          transition: "background 0.15s, color 0.15s",
        }}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <span style={{ color: muted ? "#94a3b8" : "#cbd5e1", fontFamily: "monospace", fontSize: 9, letterSpacing: 1, whiteSpace: "nowrap" }}>
        {muted ? "SILENCIO" : "AUDIO"}
      </span>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-label={expanded ? "Hide sound mixer" : "Open sound mixer"}
        aria-expanded={expanded}
        title="Sound mixer"
        style={{ width: 34, height: 34, border: "1px solid #334155", borderRadius: 8, background: expanded ? "#0e2430" : "transparent", color: "#67e8f9", display: "grid", placeItems: "center", cursor: "pointer" }}
      >
        <SlidersHorizontal size={15} aria-hidden="true" />
      </button>
      {expanded && (
        <div style={{ position: "absolute", right: 0, bottom: "calc(100% + 8px)", width: "min(250px, calc(100vw - 32px))", padding: 14, display: "grid", gap: 13, background: "rgba(3,7,18,0.97)", border: "1px solid #334155", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.55)", backdropFilter: "blur(16px)" }}>
          {[
            ["Master", volume, handleVolumeChange],
            ["Ambiente", ambience, handleAmbienceChange],
            ["Efectos", effects, handleEffectsChange],
          ].map(([label, value, onChange]) => (
            <label key={label as string} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "7px 10px", alignItems: "center", color: "#cbd5e1", fontFamily: "monospace", fontSize: 10 }}>
              <span>{label as string}</span>
              <span style={{ color: "#67e8f9" }}>{Math.round((value as number) * 100)}%</span>
              <span style={{ gridColumn: "1 / -1" }}>
                <Slider aria-label={`${label as string} volume`} min={0} max={1} step={0.01} value={[value as number]} onValueChange={onChange as (values: number[]) => void} />
              </span>
            </label>
          ))}
          <div style={{ display: "grid", gap: 7 }}>
            <span style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: 9, letterSpacing: 1, textTransform: "uppercase" }}>Probar efectos</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
              {[
                ["Tarea", "task_complete"],
                ["Pago", "payment_received"],
                ["Nivel", "level_up"],
              ].map(([label, event]) => (
                <button key={event} type="button" onClick={() => engine.playEvent(event as "task_complete" | "payment_received" | "level_up")} style={{ minHeight: 32, padding: "5px 4px", border: "1px solid rgba(34,211,238,0.25)", borderRadius: 7, background: "rgba(8,47,73,0.34)", color: "#bae6fd", fontFamily: "monospace", fontSize: 9, cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p style={{ margin: 0, color: "#64748b", fontFamily: "monospace", fontSize: 9, lineHeight: 1.5 }}>El sonido comienza tras tu primera interacción.</p>
        </div>
      )}
    </div>
  )
}
