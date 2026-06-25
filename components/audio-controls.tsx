"use client"

import { useCallback, useEffect, useState } from "react"
import { Volume2, VolumeX } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import type { CityAudioEngine } from "@/lib/audio/city-audio"

const VOLUME_KEY = "city-volume"
const MUTED_KEY = "city-muted"
const DEFAULT_VOLUME = 0.7

interface AudioControlsProps {
  engine: CityAudioEngine
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

export function AudioControls({ engine }: AudioControlsProps) {
  const [volume, setVolume] = useState(DEFAULT_VOLUME)
  const [muted, setMuted] = useState(false)
  const [hovered, setHovered] = useState(false)

  // Apply persisted preferences to the engine once on mount.
  useEffect(() => {
    const initialVolume = readStoredVolume()
    const initialMuted = readStoredMuted()
    setVolume(initialVolume)
    setMuted(initialMuted)
    engine.setVolume(initialVolume)
    engine.setMuted(initialMuted)
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

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        background: "rgba(3,7,18,0.85)",
        border: "1px solid #2a3a52",
        borderRadius: 8,
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
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
          width: 24,
          height: 24,
          background: "transparent",
          border: "none",
          color: muted ? "#64748b" : "#22d3ee",
          cursor: "pointer",
          padding: 0,
          opacity: hovered ? 1 : 0.6,
          transition: "opacity 0.15s",
        }}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <div
        style={{
          width: hovered ? 96 : 0,
          opacity: hovered ? 1 : 0,
          overflow: "hidden",
          transition: "width 0.18s ease, opacity 0.18s ease",
        }}
      >
        <Slider
          aria-label="City soundtrack volume"
          min={0}
          max={1}
          step={0.01}
          value={[volume]}
          onValueChange={handleVolumeChange}
          tabIndex={hovered ? 0 : -1}
        />
      </div>
    </div>
  )
}
